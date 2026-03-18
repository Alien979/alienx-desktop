use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const MAX_CORPUS_CHARS_PER_FILE: usize = 6_000_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventIn {
    pub timestamp: Option<String>,
    pub ip: Option<String>,
    pub method: Option<String>,
    pub path: Option<String>,
    pub status_code: Option<i32>,
    pub size: Option<i64>,
    pub user_agent: Option<String>,
    pub raw_line: Option<String>,
    pub event_id: Option<i64>,
    pub level: Option<String>,
    pub source: Option<String>,
    pub computer: Option<String>,
    pub message: Option<String>,
    pub event_data: Option<HashMap<String, String>>,
    pub source_file: Option<String>,
    pub platform: Option<String>,
    pub host: Option<String>,
    pub user: Option<String>,
    pub pid: Option<i64>,
    pub ppid: Option<i64>,
    pub process_name: Option<String>,
    pub process_cmd: Option<String>,
    pub source_type: Option<String>,
    pub facility: Option<String>,
    pub severity: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundledYaraRuleIn {
    pub id: String,
    pub name: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub source: String,
    pub source_name: String,
    pub path: String,
    pub platform: String,
    pub tags: Vec<String>,
    pub literals: Vec<String>,
    pub exclusions: Option<Vec<String>>,
    pub min_matches: usize,
    pub anchor: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YaraMatchedEventOut {
    pub event: EventIn,
    pub matched_literals: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YaraMatchedFileOut {
    pub source_file: String,
    pub matched_literals: Vec<String>,
    pub event_count: usize,
    pub matched_events: Vec<YaraMatchedEventOut>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YaraRuleMatchOut {
    pub rule: BundledYaraRuleIn,
    pub matched_files: Vec<YaraMatchedFileOut>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YaraScanStatsOut {
    pub total_rules: usize,
    pub total_files: usize,
    pub scanned_comparisons: usize,
    pub matches_found: usize,
    pub processing_time_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YaraScanResultOut {
    pub matches: Vec<YaraRuleMatchOut>,
    pub stats: YaraScanStatsOut,
}

#[derive(Debug, Clone)]
struct GroupedEvents {
    source_file: String,
    entries: Vec<EventIn>,
    corpus: String,
}

fn lower(value: &Option<String>) -> Option<String> {
    value.as_ref().map(|v| v.to_lowercase())
}

fn build_event_corpus(entry: &EventIn) -> String {
    let mut parts = Vec::new();

    for value in [
        lower(&entry.raw_line),
        lower(&entry.message),
        lower(&entry.process_name),
        lower(&entry.process_cmd),
        lower(&entry.source),
        lower(&entry.host),
        lower(&entry.computer),
    ]
    .into_iter()
    .flatten()
    {
        parts.push(value);
    }

    if let Some(event_data) = &entry.event_data {
        for value in event_data.values() {
            parts.push(value.to_lowercase());
        }
    }

    parts.join("\n")
}

fn group_events_by_source_file(events: &[EventIn]) -> Vec<GroupedEvents> {
    let mut grouped: HashMap<String, Vec<EventIn>> = HashMap::new();

    for event in events {
        let source = event
            .source_file
            .clone()
            .unwrap_or_else(|| "uploaded-data".to_string());
        grouped.entry(source).or_default().push(event.clone());
    }

    grouped
        .into_iter()
        .map(|(source_file, entries)| {
            let mut used = 0usize;
            let mut fragments: Vec<String> = Vec::new();

            for entry in &entries {
                let corpus = build_event_corpus(entry);
                if corpus.is_empty() {
                    continue;
                }

                let remaining = MAX_CORPUS_CHARS_PER_FILE.saturating_sub(used);
                if remaining == 0 {
                    break;
                }

                if corpus.len() <= remaining {
                    used += corpus.len();
                    fragments.push(corpus);
                } else {
                    fragments.push(corpus.chars().take(remaining).collect());
                    break;
                }
            }

            GroupedEvents {
                source_file,
                entries,
                corpus: fragments.join("\n"),
            }
        })
        .collect()
}

fn strictness_passes(strictness: &str, rule: &BundledYaraRuleIn, matched_files: &[YaraMatchedFileOut]) -> bool {
    let event_matches: usize = matched_files.iter().map(|f| f.matched_events.len()).sum();
    let distinct_literals: HashSet<&str> = matched_files
        .iter()
        .flat_map(|f| f.matched_literals.iter().map(|s| s.as_str()))
        .collect();
    let distinct_count = distinct_literals.len();

    match strictness {
        "permissive" => true,
        "balanced" => event_matches >= 1 && distinct_count >= usize::min(2, rule.min_matches),
        _ => event_matches >= 2 && distinct_count >= usize::max(2, rule.min_matches),
    }
}

#[tauri::command]
pub fn scan_yara_native(events: Vec<EventIn>, rules: Vec<BundledYaraRuleIn>, strictness: String) -> Result<YaraScanResultOut, String> {
    let started = std::time::Instant::now();
    let files = group_events_by_source_file(&events);
    let total_comparisons = rules.len() * files.len();
    let mut processed = 0usize;
    let mut matches_found = 0usize;
    let mut matches: Vec<YaraRuleMatchOut> = Vec::new();

    for rule in &rules {
        if rule.anchor.is_empty() || rule.literals.is_empty() {
            processed += files.len();
            continue;
        }

        let mut matched_files: Vec<YaraMatchedFileOut> = Vec::new();

        for file in &files {
            processed += 1;

            if file.corpus.is_empty() || !file.corpus.contains(&rule.anchor) {
                continue;
            }

            if let Some(exclusions) = &rule.exclusions {
                if exclusions.iter().any(|lit| file.corpus.contains(lit)) {
                    continue;
                }
            }

            let matched_literals: Vec<String> = rule
                .literals
                .iter()
                .filter(|lit| file.corpus.contains(lit.as_str()))
                .take(8)
                .cloned()
                .collect();

            if matched_literals.len() < rule.min_matches {
                continue;
            }

            let mut matched_events: Vec<YaraMatchedEventOut> = Vec::new();
            for entry in &file.entries {
                let event_corpus = build_event_corpus(entry);
                if event_corpus.is_empty() {
                    continue;
                }

                if let Some(exclusions) = &rule.exclusions {
                    if exclusions.iter().any(|lit| event_corpus.contains(lit)) {
                        continue;
                    }
                }

                let event_literals: Vec<String> = matched_literals
                    .iter()
                    .filter(|lit| event_corpus.contains(lit.as_str()))
                    .take(8)
                    .cloned()
                    .collect();

                if event_literals.len() >= rule.min_matches {
                    matched_events.push(YaraMatchedEventOut {
                        event: entry.clone(),
                        matched_literals: event_literals,
                    });
                    if matched_events.len() >= 8 {
                        break;
                    }
                }
            }

            matched_files.push(YaraMatchedFileOut {
                source_file: file.source_file.clone(),
                matched_literals,
                event_count: file.entries.len(),
                matched_events,
            });
        }

        if !matched_files.is_empty() && strictness_passes(&strictness, rule, &matched_files) {
            matches_found += matched_files.len();
            matches.push(YaraRuleMatchOut {
                rule: rule.clone(),
                matched_files,
            });
        }
    }

    matches.sort_by(|a, b| b.matched_files.len().cmp(&a.matched_files.len()));

    Ok(YaraScanResultOut {
        matches,
        stats: YaraScanStatsOut {
            total_rules: rules.len(),
            total_files: files.len(),
            scanned_comparisons: processed.min(total_comparisons),
            matches_found,
            processing_time_ms: started.elapsed().as_secs_f64() * 1000.0,
        },
    })
}