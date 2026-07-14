// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, AtomicU8, Ordering},
        Arc,
    },
    time::Duration,
};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::{
    sync::{oneshot, Mutex},
    time::timeout,
};

type PendingSender = oneshot::Sender<Result<Value, BackendError>>;
const BACKEND_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

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
    #[error("failed to spawn backend sidecar: {0}")]
    Spawn(String),
    #[error("failed to write to backend sidecar: {0}")]
    Io(String),
    #[error("backend sidecar is unavailable: {0}")]
    Unavailable(String),
    #[error("backend RPC error {code}: {message}")]
    Rpc { code: String, message: String },
    #[error("backend request timed out")]
    Timeout,
    #[error("failed to serialise backend request: {0}")]
    Serialise(String),
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct BackendCommandError {
    code: String,
    message: String,
}

impl From<BackendError> for BackendCommandError {
    fn from(error: BackendError) -> Self {
        match error {
            BackendError::Spawn(_) => Self {
                code: "backend_spawn_failed".into(),
                message: "The backend sidecar could not be started.".into(),
            },
            BackendError::Io(_) => Self {
                code: "backend_io_error".into(),
                message: "The desktop shell could not communicate with the backend sidecar.".into(),
            },
            BackendError::Unavailable(_) => Self {
                code: "backend_unavailable".into(),
                message: "The backend sidecar is unavailable. Refresh and try again.".into(),
            },
            BackendError::Rpc { code, message } => Self { code, message },
            BackendError::Timeout => Self {
                code: "backend_timeout".into(),
                message: "The backend did not respond within two minutes. The operation may still be running; refresh its status before retrying.".into(),
            },
            BackendError::Serialise(_) => Self {
                code: "request_serialisation_failed".into(),
                message: "The desktop shell could not prepare the backend request.".into(),
            },
        }
    }
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
                        for line in take_complete_lines(&mut stdout_buffer, &bytes) {
                            manager.handle_line(&app, line).await;
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

        let request_id = format!(
            "req-{}",
            self.next_request_id.fetch_add(1, Ordering::SeqCst)
        );
        let request = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        });
        let mut payload = serde_json::to_vec(&request)
            .map_err(|error| BackendError::Serialise(error.to_string()))?;
        payload.push(b'\n');

        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(request_id.clone(), sender);

        let write_result = {
            let mut child_guard = self.child.lock().await;
            let child = child_guard.as_mut().ok_or_else(|| {
                BackendError::Unavailable("The backend sidecar is not running.".into())
            })?;
            child
                .write(&payload)
                .map_err(|error| BackendError::Io(error.to_string()))
        };

        if let Err(error) = write_result {
            self.pending.lock().await.remove(&request_id);
            return Err(error);
        }

        await_backend_response(
            &self.pending,
            &request_id,
            receiver,
            BACKEND_REQUEST_TIMEOUT,
        )
        .await
    }

    async fn handle_line(&self, app: &AppHandle, line: String) {
        let Ok(payload) = serde_json::from_str::<Value>(&line) else {
            let _ = self.emit_shell_log(app, "warning", "Unparseable backend output.".into());
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
            let _ = sender.send(Err(parse_rpc_error(error)));
            return;
        }

        let _ = sender.send(Err(BackendError::Rpc {
            code: "malformed_response".into(),
            message: "The backend returned a malformed response.".into(),
        }));
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

fn parse_rpc_error(error: &Value) -> BackendError {
    let code = error
        .get("data")
        .and_then(|data| data.get("code"))
        .and_then(Value::as_str)
        .unwrap_or("backend_error")
        .to_owned();
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("The backend could not complete the request.")
        .to_owned();
    BackendError::Rpc { code, message }
}

async fn await_backend_response(
    pending: &Mutex<HashMap<String, PendingSender>>,
    request_id: &str,
    receiver: oneshot::Receiver<Result<Value, BackendError>>,
    duration: Duration,
) -> Result<Value, BackendError> {
    match timeout(duration, receiver).await {
        Ok(result) => result
            .map_err(|_| BackendError::Unavailable("the backend response channel closed".into()))?,
        Err(_) => {
            pending.lock().await.remove(request_id);
            Err(BackendError::Timeout)
        }
    }
}

fn take_complete_lines(buffer: &mut String, bytes: &[u8]) -> Vec<String> {
    buffer.push_str(&String::from_utf8_lossy(bytes));
    let mut lines = Vec::new();
    while let Some(index) = buffer.find('\n') {
        let line: String = buffer.drain(..=index).collect();
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            lines.push(trimmed.to_owned());
        }
    }
    lines
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
) -> Result<Value, BackendCommandError> {
    state
        .0
        .request(app, method, params)
        .await
        .map_err(BackendCommandError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_ids_accept_strings_and_numbers() {
        assert_eq!(response_id(&json!("req-7")), "req-7");
        assert_eq!(response_id(&json!(42)), "42");
    }

    #[test]
    fn stdout_line_buffer_preserves_partial_chunks() {
        let mut buffer = String::new();
        assert!(take_complete_lines(&mut buffer, b"{\"id\":1").is_empty());
        assert_eq!(
            take_complete_lines(&mut buffer, b"}\n\n{\"id\":2}\npartial"),
            vec!["{\"id\":1}", "{\"id\":2}"]
        );
        assert_eq!(buffer, "partial");
    }

    #[test]
    fn rpc_error_uses_stable_code_and_safe_message() {
        let error = parse_rpc_error(&json!({
            "code": -32601,
            "message": "This backend operation is not available.",
            "data": { "code": "method_not_found" }
        }));
        let command_error = BackendCommandError::from(error);
        assert_eq!(
            command_error,
            BackendCommandError {
                code: "method_not_found".into(),
                message: "This backend operation is not available.".into(),
            }
        );
    }

    #[test]
    fn timeout_removes_pending_request() {
        tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .expect("build test runtime")
            .block_on(async {
                let pending = Mutex::new(HashMap::new());
                let (sender, receiver) = oneshot::channel();
                pending.lock().await.insert("req-timeout".into(), sender);

                let result = await_backend_response(
                    &pending,
                    "req-timeout",
                    receiver,
                    Duration::from_millis(1),
                )
                .await;

                assert!(matches!(result, Err(BackendError::Timeout)));
                assert!(pending.lock().await.is_empty());
            });
    }
}

fn main() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
