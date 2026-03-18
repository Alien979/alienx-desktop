// Native XML EVTX parser for Tauri backend (Rust)
// Initial version: Windows EVTX XML only

// use serde::{Deserialize, Serialize};
use tauri::{command, Window};
use tauri::Emitter;
use crate::excel_accel::LogEntry;
use std::collections::HashMap;
#[command]
pub async fn parse_xml_file_native(window: Window, path: String) -> Result<Vec<LogEntry>, String> {
    use std::fs::File;
    use std::io::BufReader;
    use quick_xml::Reader;
    use quick_xml::events::Event as XmlEvent;
    let file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = Reader::from_reader(BufReader::new(file));
    // reader.trim_text(true); // Not available in quick-xml 0.22+
    let mut buf = Vec::new();
    let mut entries = Vec::new();
    let mut total_lines = 0;
    let mut in_event = false;
    let mut event_buf = Vec::new();
    let mut event_count = 0;
    while let Ok(xml_event) = reader.read_event_into(&mut buf) {
        match xml_event {
            XmlEvent::Start(ref e) if e.name().as_ref() == b"Event" => {
                in_event = true;
                event_buf.clear();
                event_buf.extend_from_slice(b"<Event>");
            }
            XmlEvent::End(ref e) if e.name().as_ref() == b"Event" => {
                if in_event {
                    event_buf.extend_from_slice(b"</Event>");
                    // Parse this event XML fragment
                    if let Ok(event_str) = String::from_utf8(event_buf.clone()) {
                        if let Some(entry) = parse_event_xml(&event_str, &path) {
                            entries.push(entry);
                        }
                    }
                    total_lines += 1;
                    event_count += 1;
                    // Emit progress every 1000 events
                    if event_count % 1000 == 0 {
                        let _ = window.emit("xml-parse-progress", event_count);
                        println!("Parsed {} events...", event_count);
                    }
                    in_event = false;
                }
            }
            XmlEvent::Eof => break,
            _ => {
                if in_event {
                    // Extend event_buf with the raw bytes of the event
                    match &xml_event {
                        XmlEvent::Text(e) => event_buf.extend_from_slice(e.as_ref()),
                        XmlEvent::Start(e) => {
                            event_buf.extend_from_slice(b"<");
                            event_buf.extend_from_slice(e.name().as_ref());
                            event_buf.extend_from_slice(b">");
                        }
                        XmlEvent::End(e) => {
                            event_buf.extend_from_slice(b"</");
                            event_buf.extend_from_slice(e.name().as_ref());
                            event_buf.extend_from_slice(b">");
                        }
                        _ => {}
                    }
                }
            }
        }
        buf.clear();
    }
    // Final progress emit
    let _ = window.emit("xml-parse-progress", event_count);
    Ok(entries)
}

fn parse_event_xml(event_xml: &str, source_file: &str) -> Option<LogEntry> {
    use quick_xml::Reader;
    use quick_xml::events::Event;
    let mut reader = Reader::from_str(event_xml);
    // reader.trim_text(true); // Not available in quick-xml 0.39+
    let mut buf = Vec::new();
    let mut timestamp = String::new();
    let mut event_id: Option<u64> = None;
    let mut level: Option<String> = None;
    let mut source: Option<String> = None;
    let mut computer: Option<String> = None;
    let mut message: Option<String> = None;
    let mut user: Option<String> = None;
    let mut event_data = HashMap::new();
    while let Ok(ev) = reader.read_event_into(&mut buf) {
        match ev {
            Event::Start(ref e) => {
                match e.name().as_ref() {
                    b"EventID" => {
                        if let Ok(text) = reader.read_text(e.name()) {
                            event_id = text.parse().ok();
                        }
                    }
                    b"Level" => {
                        if let Ok(text) = reader.read_text(e.name()) {
                            level = Some(text.into_owned());
                        }
                    }
                    b"TimeCreated" => {
                        if let Some(Ok(attr)) = e.attributes().find(|a| a.as_ref().map(|a| a.key.as_ref() == b"SystemTime").unwrap_or(false)) {
                            timestamp = String::from_utf8_lossy(&attr.value).to_string();
                        }
                    }
                    b"Computer" => {
                        if let Ok(text) = reader.read_text(e.name()) {
                            computer = Some(text.into_owned());
                        }
                    }
                    b"Provider" => {
                        if let Some(Ok(attr)) = e.attributes().find(|a| a.as_ref().map(|a| a.key.as_ref() == b"Name").unwrap_or(false)) {
                            source = Some(String::from_utf8_lossy(&attr.value).to_string());
                        }
                    }
                    b"Message" => {
                        if let Ok(text) = reader.read_text(e.name()) {
                            message = Some(text.into_owned());
                        }
                    }
                    b"UserID" => {
                        if let Ok(text) = reader.read_text(e.name()) {
                            user = Some(text.into_owned());
                        }
                    }
                    _ => {}
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Some(LogEntry {
        timestamp,
        event_id,
        level,
        source,
        computer,
        message,
        user,
        process_name: None,
        process_cmd: None,
        pid: None,
        ppid: None,
        ip: None,
        method: None,
        path: None,
        status_code: None,
        user_agent: None,
        event_data,
        raw_line: event_xml.to_string(),
        platform: "windows".to_string(),
        source_file: source_file.to_string(),
    })
}
