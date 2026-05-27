#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU8, AtomicU64, Ordering},
        Arc,
    },
};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::sync::{oneshot, Mutex};

type PendingSender = oneshot::Sender<Result<Value, BackendError>>;

#[derive(Default)]
struct BackendState(Arc<SidecarManager>);

struct SidecarManager {
    child: Mutex<Option<CommandChild>>,
    pending: Mutex<HashMap<String, PendingSender>>,
    next_request_id: AtomicU64,
    next_log_id: AtomicU64,
    restart_count: AtomicU8,
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            next_request_id: AtomicU64::new(1),
            next_log_id: AtomicU64::new(1),
            restart_count: AtomicU8::new(0),
        }
    }
}

#[derive(Debug, Error)]
enum BackendError {
    #[error("Failed to spawn backend sidecar: {0}")]
    Spawn(String),
    #[error("Failed to write to backend sidecar: {0}")]
    Io(String),
    #[error("Backend sidecar is unavailable: {0}")]
    Unavailable(String),
    #[error("Backend RPC error: {0}")]
    Rpc(String),
    #[error("Failed to serialise backend request: {0}")]
    Serialise(String),
}

impl SidecarManager {
    async fn ensure_started(self: &Arc<Self>, app: AppHandle) -> Result<(), BackendError> {
        let mut child_guard = self.child.lock().await;
        if child_guard.is_some() {
            return Ok(());
        }

        let sidecar = app
            .shell()
            .sidecar("cloudsprocketd")
            .map_err(|error| BackendError::Spawn(error.to_string()))?;
        let (mut events, child) = sidecar
            .spawn()
            .map_err(|error| BackendError::Spawn(error.to_string()))?;
        *child_guard = Some(child);
        drop(child_guard);

        let manager = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let mut stdout_buffer = String::new();
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let chunk = String::from_utf8_lossy(&bytes);
                        stdout_buffer.push_str(&chunk);
                        while let Some(index) = stdout_buffer.find('\n') {
                            let line: String = stdout_buffer.drain(..=index).collect();
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                manager.handle_line(&app, trimmed.to_owned()).await;
                            }
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let message = String::from_utf8_lossy(&bytes).trim().to_owned();
                        if !message.is_empty() {
                            let _ = manager.emit_shell_log(&app, "warning", message);
                        }
                    }
                    CommandEvent::Terminated(_payload) => {
                        manager.handle_termination(app.clone()).await;
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    async fn request(
        self: &Arc<Self>,
        app: AppHandle,
        method: String,
        params: Value,
    ) -> Result<Value, BackendError> {
        self.ensure_started(app.clone()).await?;

        let request_id = format!("req-{}", self.next_request_id.fetch_add(1, Ordering::SeqCst));
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(request_id.clone(), sender);

        let request = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        });
        let mut payload = serde_json::to_vec(&request)
            .map_err(|error| BackendError::Serialise(error.to_string()))?;
        payload.push(b'\n');

        let write_result = {
            let mut child_guard = self.child.lock().await;
            let child = child_guard
                .as_mut()
                .ok_or_else(|| BackendError::Unavailable("The backend sidecar is not running.".into()))?;
            child
                .write(&payload)
                .map_err(|error| BackendError::Io(error.to_string()))
        };

        if let Err(error) = write_result {
            self.pending.lock().await.remove(&request_id);
            return Err(error);
        }

        receiver
            .await
            .map_err(|_| BackendError::Unavailable("The backend response channel closed.".into()))?
    }

    async fn handle_line(&self, app: &AppHandle, line: String) {
        let Ok(payload) = serde_json::from_str::<Value>(&line) else {
            let _ = self.emit_shell_log(app, "warning", format!("Unparseable backend output: {line}"));
            return;
        };

        if payload.get("method").is_some() && payload.get("id").is_none() {
            if let Some(method) = payload.get("method").and_then(Value::as_str) {
                let event_payload = payload.get("params").cloned().unwrap_or(Value::Null);
                let _ = app.emit(&tauri_event_name(method), event_payload);
            }
            return;
        }

        let Some(id_value) = payload.get("id") else {
            return;
        };
        let response_id = response_id(id_value);
        let Some(sender) = self.pending.lock().await.remove(&response_id) else {
            return;
        };

        if let Some(result) = payload.get("result") {
            let _ = sender.send(Ok(result.clone()));
            return;
        }

        if let Some(error) = payload.get("error") {
            let _ = sender.send(Err(BackendError::Rpc(error.to_string())));
            return;
        }

        let _ = sender.send(Err(BackendError::Rpc(
            "Malformed backend response.".into(),
        )));
    }

    async fn handle_termination(self: &Arc<Self>, app: AppHandle) {
        *self.child.lock().await = None;

        let mut pending = self.pending.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err(BackendError::Unavailable(
                "The backend sidecar terminated unexpectedly.".into(),
            )));
        }
        drop(pending);

        let restart_attempt = self.restart_count.fetch_add(1, Ordering::SeqCst);
        if restart_attempt == 0 {
            let _ = self.emit_shell_log(
                &app,
                "warning",
                "The backend sidecar exited. It will restart on the next request.".into(),
            );
            return;
        }

        let _ = self.emit_shell_log(
            &app,
            "error",
            "The backend sidecar stopped again after a previous exit.".into(),
        );
    }

    fn emit_shell_log(
        &self,
        app: &AppHandle,
        level: &str,
        message: String,
    ) -> Result<(), tauri::Error> {
        app.emit(
            &tauri_event_name("log.appended"),
            json!({
                "id": self.next_log_id.fetch_add(1, Ordering::SeqCst),
                "level": level,
                "message": message,
                "timestamp": timestamp_now(),
            }),
        )
    }
}

fn tauri_event_name(method: &str) -> String {
    method.replace('.', ":")
}

fn response_id(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        _ => value.to_string(),
    }
}

fn timestamp_now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

#[tauri::command]
async fn backend_request(
    app: AppHandle,
    state: State<'_, BackendState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    state
        .0
        .request(app, method, params)
        .await
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let manager = app.state::<BackendState>().0.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = manager.ensure_started(app_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_request])
        .run(tauri::generate_context!())
        .expect("error while running CloudSprocket desktop shell");
}
