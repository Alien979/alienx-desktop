// --- Severity Scoring and Summary Generation ---
fn calculate_severity(chain_len: usize, sigma_levels: &[String]) -> (String, u32) {
    let mut score = 0u32;
    for level in sigma_levels {
        match level.as_str() {
            "critical" => score += 100,
            "high" => score += 50,
            "medium" => score += 20,
            "low" => score += 5,
            _ => {}
        }
    }
    score += std::cmp::min(chain_len as u32 * 2, 30);
    let severity = if score >= 100 {
        "critical"
    } else if score >= 50 {
        "high"
    } else if score >= 20 {
        "medium"
    } else if score >= 5 {
        "low"
    } else {
        "info"
    };
    (severity.to_string(), score)
}

fn generate_chain_summary(chain_len: usize, sigma_titles: &[String]) -> String {
    if !sigma_titles.is_empty() {
        format!("{} | {} related events", sigma_titles[0], chain_len)
    } else {
        format!("{} related events", chain_len)
    }
}
// --- Relationship and Chain Grouping ---
#[derive(Debug, Clone, Serialize, Deserialize)]
struct EventRelationship {
    source_index: usize,
    target_index: usize,
    rel_type: String,
    confidence: f32,
}

struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
}

impl UnionFind {
    fn new(size: usize) -> Self {
        Self {
            parent: (0..size).collect(),
            rank: vec![0; size],
        }
    }
    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]);
        }
        self.parent[x]
    }
    fn union(&mut self, x: usize, y: usize) {
        let xroot = self.find(x);
        let yroot = self.find(y);
        if xroot == yroot { return; }
        if self.rank[xroot] < self.rank[yroot] {
            self.parent[xroot] = yroot;
        } else if self.rank[xroot] > self.rank[yroot] {
            self.parent[yroot] = xroot;
        } else {
            self.parent[yroot] = xroot;
            self.rank[xroot] += 1;
        }
    }
}

fn find_relationships(entries: &[LogEntry], indices: &EventIndices) -> Vec<EventRelationship> {
    let mut rels = Vec::new();
    for (idx, entry) in entries.iter().enumerate() {
        if let Some(proc_guid) = get_process_guid(entry) {
            if let Some(same_proc) = indices.by_process_guid.get(&proc_guid) {
                for &other_idx in same_proc {
                    if other_idx < idx {
                        rels.push(EventRelationship {
                            source_index: other_idx,
                            target_index: idx,
                            rel_type: "same_process".to_string(),
                            confidence: 1.0,
                        });
                    }
                }
            }
        }
        if let Some(parent_guid) = get_parent_process_guid(entry) {
            if let Some(parent_events) = indices.by_process_guid.get(&parent_guid) {
                for &parent_idx in parent_events {
                    if parent_idx != idx {
                        rels.push(EventRelationship {
                            source_index: parent_idx,
                            target_index: idx,
                            rel_type: "process_spawn".to_string(),
                            confidence: 1.0,
                        });
                    }
                }
            }
        }
        // Add more relationship types as needed (network, file, registry, etc.)
    }
    rels
}
// correlation_engine.rs
// Rust port of the event correlation engine from correlationEngine.ts
// This module will expose a Tauri command for event correlation.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String, // Use ISO8601 string for cross-language compatibility
    pub event_id: Option<u32>,
    pub computer: Option<String>,
    pub raw_line: Option<String>,
    pub event_data: Option<HashMap<String, String>>,
    // ... add more fields as needed ...
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SigmaRuleMatch {
    pub rule_id: String,
    pub rule_title: String,
    pub level: String,
    pub event_index: usize,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrelatedChain {
    pub id: String,
    pub event_indices: Vec<usize>,
    pub severity: String,
    pub score: u32,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrelationAnalytics {
    pub total_chains: usize,
    pub avg_chain_length: f32,
    pub top_processes: Vec<String>,
    pub max_score: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrelationResult {
    pub chains: Vec<CorrelatedChain>,
    pub analytics: CorrelationAnalytics,
}


// --- Event Indexing Structures ---
#[derive(Default)]
struct EventIndices {
    by_process_guid: HashMap<String, Vec<usize>>,
    by_parent_guid: HashMap<String, Vec<usize>>,
    by_event_id: HashMap<u32, Vec<usize>>,
    by_computer: HashMap<String, Vec<usize>>,
}

fn extract_field(entry: &LogEntry, field: &str) -> Option<String> {
    if let Some(ref data) = entry.event_data {
        if let Some(val) = data.get(field) {
            return Some(val.clone());
        }
    }
    // Optionally: parse from raw_line if needed
    None
}

fn get_process_guid(entry: &LogEntry) -> Option<String> {
    extract_field(entry, "ProcessGuid")
        .or_else(|| extract_field(entry, "SourceProcessGuid"))
        .or_else(|| extract_field(entry, "NewProcessId"))
        .or_else(|| extract_field(entry, "ProcessId"))
}

fn get_parent_process_guid(entry: &LogEntry) -> Option<String> {
    extract_field(entry, "ParentProcessGuid")
        .or_else(|| extract_field(entry, "ParentProcessId"))
        .or_else(|| extract_field(entry, "ProcessId"))
}

fn build_indices(entries: &[LogEntry]) -> EventIndices {
    let mut indices = EventIndices::default();
    for (idx, entry) in entries.iter().enumerate() {
        if let Some(proc_guid) = get_process_guid(entry) {
            indices.by_process_guid.entry(proc_guid).or_default().push(idx);
        }
        if let Some(parent_guid) = get_parent_process_guid(entry) {
            indices.by_parent_guid.entry(parent_guid).or_default().push(idx);
        }
        if let Some(event_id) = entry.event_id {
            indices.by_event_id.entry(event_id).or_default().push(idx);
        }
        if let Some(ref computer) = entry.computer {
            indices.by_computer.entry(computer.clone()).or_default().push(idx);
        }
    }
    indices
}


#[tauri::command]
pub fn correlate_events_native(
    entries: Vec<LogEntry>,
    sigma_matches: Vec<SigmaRuleMatch>,
    app_handle: tauri::AppHandle,
) -> CorrelationResult {
    use tauri::Manager;
    use tauri::Emitter;
    if entries.is_empty() {
        return CorrelationResult {
            chains: vec![],
            analytics: CorrelationAnalytics {
                total_chains: 0,
                avg_chain_length: 0.0,
                top_processes: vec![],
                max_score: 0,
            },
        };
    }

    let indices = build_indices(&entries);
    let relationships = find_relationships(&entries, &indices);
    let mut uf = UnionFind::new(entries.len());
    for rel in &relationships {
        uf.union(rel.source_index, rel.target_index);
    }

    // Group events by root
    let mut chain_groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..entries.len() {
        let root = uf.find(i);
        chain_groups.entry(root).or_default().push(i);
    }

    // Map event index to sigma matches
    let mut sigma_by_event: HashMap<usize, Vec<&SigmaRuleMatch>> = HashMap::new();
    for m in &sigma_matches {
        sigma_by_event.entry(m.event_index).or_default().push(m);
    }

    let mut chains = Vec::new();
    let mut chain_id = 0;
    let total_chains = chain_groups.len();
    let mut all_processes = HashMap::new();
    let mut max_score = 0u32;
    for (i, (_root, event_indices)) in chain_groups.into_iter().enumerate() {
        if event_indices.len() < 2 { continue; }
        // Collect sigma levels and titles for this chain
        let mut sigma_levels = Vec::new();
        let mut sigma_titles = Vec::new();
        for &idx in &event_indices {
            if let Some(matches) = sigma_by_event.get(&idx) {
                for m in matches {
                    sigma_levels.push(m.level.clone());
                    sigma_titles.push(m.rule_title.clone());
                }
            }
            // Track process image for analytics
            if let Some(ref data) = entries[idx].event_data {
                if let Some(proc_name) = data.get("Image") {
                    *all_processes.entry(proc_name.clone()).or_insert(0u32) += 1;
                }
            }
        }
        let (severity, score) = calculate_severity(event_indices.len(), &sigma_levels);
        if score > max_score { max_score = score; }
        let summary = generate_chain_summary(event_indices.len(), &sigma_titles);
        chains.push(CorrelatedChain {
            id: format!("chain-{}", chain_id),
            event_indices: event_indices.clone(),
            severity,
            score,
            summary,
        });
        chain_id += 1;
        // Emit progress event every 10 chains
        if i % 10 == 0 {
            let _ = app_handle.emit("correlation_progress", i as u64);
        }
    }
    // Sort by score descending
    chains.sort_by(|a, b| b.score.cmp(&a.score));
    let avg_chain_length = if chains.is_empty() { 0.0 } else { chains.iter().map(|c| c.event_indices.len() as f32).sum::<f32>() / chains.len() as f32 };
    let mut top_processes: Vec<_> = all_processes.into_iter().collect();
    top_processes.sort_by(|a, b| b.1.cmp(&a.1));
    let top_processes: Vec<String> = top_processes.into_iter().take(5).map(|(p, _)| p).collect();
    CorrelationResult {
        chains: chains.clone(),
        analytics: CorrelationAnalytics {
            total_chains: chains.len(),
            avg_chain_length,
            top_processes,
            max_score,
        },
    }
}
