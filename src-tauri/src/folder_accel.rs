// Native folder and chunked log parser for Tauri backend (Rust)
// Scaffolding for robust, large-scale log/folder parsing

use tauri::{command, Window};
use std::pin::Pin;
use std::future::Future;
use tauri::Emitter;
use std::fs;
use std::path::PathBuf;
use crate::excel_accel::LogEntry;

#[command]
pub async fn parse_folder_native(window: Window, folder_path: String) -> Result<Vec<LogEntry>, String> {
    let mut all_entries = Vec::new();
    let walker = match fs::read_dir(&folder_path) {
        Ok(w) => w,
        Err(e) => return Err(format!("Failed to read folder: {}", e)),
    };
    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                let _ = window.emit("folder-parse-error", format!("Error reading entry: {}", e));
                continue;
            }
        };
        let path = entry.path();
        if path.is_file() {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            let path_str = path.to_string_lossy().to_string();
            // Call appropriate parser based on extension
            let entries_result: Result<Vec<crate::excel_accel::LogEntry>, String> = match ext.as_str() {
                "evtx" | "xml" => crate::xml_accel::parse_xml_file_native(window.clone(), path_str.clone()).await,
                "csv" | "tsv" => crate::excel_accel::parse_csv_file_native(path_str.clone()).map(|pd| pd.entries),
                _ => Ok(Vec::new()),
            };
            match entries_result {
                Ok(mut e) => all_entries.append(&mut e),
                Err(e) => {
                    let _ = window.emit("folder-parse-error", format!("Error parsing {}: {}", path_str, e));
                }
            }
            let _ = window.emit("folder-parse-progress", path_str);
        }
    }
    Ok(all_entries)
}

fn collect_files_recursive(folder_path: &str, files: &mut Vec<PathBuf>, window: &Window) -> Result<(), String> {
    let walker = match fs::read_dir(folder_path) {
        Ok(w) => w,
        Err(e) => return Err(format!("Failed to read folder: {}", e)),
    };
    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                let _ = window.emit("folder-parse-error", format!("Error reading entry: {}", e));
                continue;
            }
        };
        let path = entry.path();
        if path.is_file() {
            files.push(path);
        } else if path.is_dir() {
            collect_files_recursive(&path.to_string_lossy(), files, window)?;
        }
    }
    Ok(())
}
