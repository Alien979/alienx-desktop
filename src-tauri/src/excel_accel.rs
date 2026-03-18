// Native Excel/CSV/TSV parser for Tauri backend
// Initial version: CSV/TSV only (XLSX support can be added later)

use serde::{Deserialize, Serialize};
use tauri::command;
use std::fs::File;
use std::io::BufReader;
use csv::ReaderBuilder;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub timestamp: String, // Use String for now, can parse to chrono::DateTime if needed
    pub event_id: Option<u64>,
    pub level: Option<String>,
    pub source: Option<String>,
    pub computer: Option<String>,
    pub message: Option<String>,
    pub user: Option<String>,
    pub process_name: Option<String>,
    pub process_cmd: Option<String>,
    pub pid: Option<u64>,
    pub ppid: Option<u64>,
    pub ip: Option<String>,
    pub method: Option<String>,
    pub path: Option<String>,
    pub status_code: Option<u64>,
    pub user_agent: Option<String>,
    pub event_data: HashMap<String, String>,
    pub raw_line: String,
    pub platform: String,
    pub source_file: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedData {
    pub entries: Vec<LogEntry>,
    pub format: String,
    pub platform: String,
    pub total_lines: usize,
    pub parsed_lines: usize,
    pub source_files: Vec<String>,
}

fn normalize_col(col: &str) -> String {
    col.to_lowercase().replace(|c: char| c.is_whitespace() || "-_()/\\".contains(c), "")
}

// TODO: Add column sets and mapping logic (see TS version)


// --- Column sets (normalized, as in TS) ---
fn colset(strings: &[&str]) -> Vec<String> {
    strings.iter().map(|s| normalize_col(s)).collect()
}

fn detect_column(col: &str, set: &[String]) -> bool {
    set.contains(&normalize_col(col))
}

const TIMESTAMP_COLS: &[&str] = &["timecreated","timegenerated","timestamp","time","datetime","date","eventtime","recordtime","createdat","event_time","systemtime","utctime","@timestamp","eventcreatedtime","datetime(utc)","eventdate","date_generated","logtime","alerttime","occurrencetime","writtentime","generatedtime"];
const EVENTID_COLS: &[&str] = &["eventid","eventcode","event_id","id","recordnumber","eventrecordid","windowseventid"];
const LEVEL_COLS: &[&str] = &["level","severity","eventtype","log_level","loglevel","rulelevel","alertlevel","priority","criticality"];
const SOURCE_COLS: &[&str] = &["source","sourcename","providername","provider","channel","category","logname","taskcategory","task","logsource"];
const COMPUTER_COLS: &[&str] = &["computer","computername","hostname","host","system","machine","devicename","systemname","workstation","device","endpoint","machinename"];
const MESSAGE_COLS: &[&str] = &["message","description","eventdescription","msg","text","details","messagetext","rulename","ruletitle","alertname","fullmessage","rawmessage"];
const USER_COLS: &[&str] = &["user","subjectusername","accountname","username","targetusername","accountdomain","subjectdomainname","account","logonuser","subjectuser"];
const LINUX_SOURCE_COLS: &[&str] = &["syslogidentifier","systemdunit","transporttype","journaldunit","comm","exe","syscall","auditd","audit","cgroup","bootid","machineid"];
const PROCESSNAME_COLS: &[&str] = &["processname","image","process_name","applicationname","exe","application","imagepath","executablepath"];
const PID_COLS: &[&str] = &["processid","pid","process_id","newprocessid","parentprocessid"];
const IP_COLS: &[&str] = &["ipaddress","sourceip","source_ip","ip","remoteaddress","clientip","sourceaddress","destinationip","dest_ip","srcip","dstip","networksourceip","networkdestinationip","ipaddr","srcaddress"];
const METHOD_COLS: &[&str] = &["method","httpmethod","requestmethod","csmethod","verb"];
const PATH_COLS: &[&str] = &["path","url","requestpath","csuri","csuristem","uri","uniformresourceidentifier","requesturl"];
const STATUSCODE_COLS: &[&str] = &["statuscode","status_code","status","httpstatuscode","scstatus","responsecode","resultcode"];
const USERAGENT_COLS: &[&str] = &["useragent","user_agent","browser","csuseragent","csversion"];
const PROCESSCOMMAND_COLS: &[&str] = &["commandline","command_line","processcmd","parentcommandline","commandlinearguments","cmdline"];
const PPID_COLS: &[&str] = &["parentprocessid","ppid","parentpid"];

#[command]
pub fn parse_csv_file_native(path: String) -> Result<ParsedData, String> {
    let file = File::open(&path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut rdr = ReaderBuilder::new()
        .has_headers(true)
        .from_reader(BufReader::new(file));

    let headers = rdr.headers().map_err(|e| format!("CSV header error: {}", e))?.clone();
    let header_vec: Vec<String> = headers.iter().map(|h| h.to_string()).collect();

    // Build field map: header -> field name
    let ts_cols = colset(TIMESTAMP_COLS);
    let eid_cols = colset(EVENTID_COLS);
    let lvl_cols = colset(LEVEL_COLS);
    let src_cols = colset(SOURCE_COLS);
    let comp_cols = colset(COMPUTER_COLS);
    let msg_cols = colset(MESSAGE_COLS);
    let user_cols = colset(USER_COLS);
    let linux_cols = colset(LINUX_SOURCE_COLS);
    let pname_cols = colset(PROCESSNAME_COLS);
    let pid_cols = colset(PID_COLS);
    let ip_cols = colset(IP_COLS);
    let meth_cols = colset(METHOD_COLS);
    let path_cols = colset(PATH_COLS);
    let stat_cols = colset(STATUSCODE_COLS);
    let ua_cols = colset(USERAGENT_COLS);
    let pcmd_cols = colset(PROCESSCOMMAND_COLS);
    let ppid_cols = colset(PPID_COLS);

    // Map header to field
    let mut field_map: HashMap<String, &'static str> = HashMap::new();
    for h in &header_vec {
        let norm = normalize_col(h);
        let field = if detect_column(h, &ts_cols) {
            "timestamp"
        } else if detect_column(h, &eid_cols) {
            "event_id"
        } else if detect_column(h, &lvl_cols) {
            "level"
        } else if detect_column(h, &src_cols) {
            "source"
        } else if detect_column(h, &comp_cols) {
            "computer"
        } else if detect_column(h, &msg_cols) {
            "message"
        } else if detect_column(h, &user_cols) {
            "user"
        } else if detect_column(h, &pname_cols) {
            "process_name"
        } else if detect_column(h, &ppid_cols) {
            "ppid"
        } else if detect_column(h, &pid_cols) {
            "pid"
        } else if detect_column(h, &pcmd_cols) {
            "process_cmd"
        } else if detect_column(h, &ip_cols) {
            "ip"
        } else if detect_column(h, &meth_cols) {
            "method"
        } else if detect_column(h, &path_cols) {
            "path"
        } else if detect_column(h, &stat_cols) {
            "status_code"
        } else if detect_column(h, &ua_cols) {
            "user_agent"
        } else {
            "event_data"
        };
        field_map.insert(h.clone(), field);
    }

    // Detect platform
    let is_linux = header_vec.iter().any(|h| detect_column(h, &linux_cols));
    let platform = if is_linux { "linux" } else { "windows" };

    let mut entries = Vec::new();
    let mut total_lines = 0;
    for result in rdr.records() {
        let record = result.map_err(|e| format!("CSV record error: {}", e))?;
        let event_data: HashMap<String, String> = HashMap::new();
        let mut raw_line = String::new();
        let mut entry = LogEntry {
            timestamp: String::new(),
            event_id: None,
            level: None,
            source: None,
            computer: None,
            message: None,
            user: None,
            process_name: None,
            process_cmd: None,
            pid: None,
            ppid: None,
            ip: None,
            method: None,
            path: None,
            status_code: None,
            user_agent: None,
            event_data: HashMap::new(),
            raw_line: String::new(),
            platform: platform.to_string(),
            source_file: path.clone(),
        };
        for (h, v) in headers.iter().zip(record.iter()) {
            let field = field_map.get(h).map(|s| *s).unwrap_or("event_data");
            let v = v.trim();
            if v.is_empty() { continue; }
            match field {
                "timestamp" => entry.timestamp = v.to_string(),
                "event_id" => entry.event_id = v.parse().ok(),
                "level" => entry.level = Some(v.to_string()),
                "source" => entry.source = Some(v.to_string()),
                "computer" => entry.computer = Some(v.to_string()),
                "message" => entry.message = Some(v.to_string()),
                "user" => entry.user = Some(v.to_string()),
                "process_name" => entry.process_name = Some(v.to_string()),
                "process_cmd" => entry.process_cmd = Some(v.to_string()),
                "pid" => entry.pid = v.parse().ok(),
                "ppid" => entry.ppid = v.parse().ok(),
                "ip" => entry.ip = Some(v.to_string()),
                "method" => entry.method = Some(v.to_string()),
                "path" => entry.path = Some(v.to_string()),
                "status_code" => entry.status_code = v.parse().ok(),
                "user_agent" => entry.user_agent = Some(v.to_string()),
                _ => { entry.event_data.insert(h.to_string(), v.to_string()); },
            }
            raw_line.push_str(&format!("{}={}", h, v));
            raw_line.push_str(" | ");
        }
        entry.raw_line = raw_line;
        entries.push(entry);
        total_lines += 1;
    }
    Ok(ParsedData {
        entries,
        format: "csv".to_string(),
        platform: platform.to_string(),
        total_lines,
        parsed_lines: total_lines,
        source_files: vec![path],
    })
}
