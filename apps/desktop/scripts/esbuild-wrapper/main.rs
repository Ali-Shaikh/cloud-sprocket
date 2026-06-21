// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let esbuild_path = match find_esbuild() {
        Ok(path) => path,
        Err(err) => {
            eprintln!("{err}");
            return ExitCode::from(1);
        }
    };

    let args: Vec<String> = env::args().skip(1).collect();
    match run_esbuild(&esbuild_path, &args) {
        Ok(code) => ExitCode::from(code as u8),
        Err(err) => {
            eprintln!("{err}");
            ExitCode::from(1)
        }
    }
}

fn run_esbuild(esbuild_path: &Path, args: &[String]) -> Result<i32, String> {
    let status = Command::new(esbuild_path)
        .args(args)
        .status()
        .map_err(|err| format!("esbuild wrapper: failed to run {esbuild_path:?}: {err}"))?;

    if let Some(code) = status.code() {
        return Ok(code);
    }

    let mut cmd_args = Vec::with_capacity(args.len() + 2);
    cmd_args.push("/c".to_string());
    cmd_args.push(esbuild_path.display().to_string());
    cmd_args.extend_from_slice(args);

    let status = Command::new("cmd")
        .args(&cmd_args)
        .status()
        .map_err(|err| format!("esbuild wrapper: cmd fallback failed: {err}"))?;

    Ok(status.code().unwrap_or(1))
}

fn find_esbuild() -> Result<PathBuf, String> {
    let exe_path = env::current_exe().map_err(|err| {
        format!("esbuild wrapper: cannot resolve executable path: {err}")
    })?;
    let repo_root = find_repo_root(
        exe_path
            .parent()
            .ok_or_else(|| "esbuild wrapper: invalid executable path".to_string())?,
    )?;

    let pnpm_dir = repo_root.join("node_modules").join(".pnpm");
    let entries = fs::read_dir(&pnpm_dir)
        .map_err(|err| format!("esbuild wrapper: cannot read {pnpm_dir:?}: {err}"))?;

    for entry in entries {
        let entry = entry.map_err(|err| format!("esbuild wrapper: {err}"))?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.starts_with("@esbuild+win32-x64@") {
            continue;
        }

        let candidate = entry
            .path()
            .join("node_modules")
            .join("@esbuild")
            .join("win32-x64")
            .join("esbuild.exe");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("esbuild wrapper: esbuild.exe not found under node_modules/.pnpm".to_string())
}

fn find_repo_root(start: &Path) -> Result<PathBuf, String> {
    let mut current = start.to_path_buf();
    loop {
        if current.join("node_modules").join(".pnpm").is_dir() {
            return Ok(current);
        }
        let parent = current.parent().ok_or_else(|| {
            "esbuild wrapper: could not locate node_modules/.pnpm in parent directories".to_string()
        })?;
        current = parent.to_path_buf();
    }
}
