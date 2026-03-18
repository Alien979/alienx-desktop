use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaEventIn {
    pub raw_line: Option<String>,
    pub message: Option<String>,
    pub process_name: Option<String>,
    pub process_cmd: Option<String>,
    pub source: Option<String>,
    pub host: Option<String>,
    pub computer: Option<String>,
    pub event_data: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaQuickFilterIn {
    pub field: String,
    pub r#type: String,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaRulePrefilterIn {
    pub id: String,
    pub filters: Vec<SigmaQuickFilterIn>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaRuleCandidatesOut {
    pub rule_id: String,
    pub event_indices: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaPrefilterStatsOut {
    pub total_comparisons: u64,
    pub quick_rejects: u64,
    pub candidate_comparisons: u64,
    pub processing_time_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaPrefilterResultOut {
    pub candidates: Vec<SigmaRuleCandidatesOut>,
    pub stats: SigmaPrefilterStatsOut,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmaProgressEventOut {
    pub processed: u64,
    pub total: u64,
    pub quick_rejects: u64,
    pub candidates_found: u64,
}

fn extract_data_name_value(raw_line: &str, field: &str) -> Option<String> {
    let raw_lower = raw_line.to_lowercase();
    let needle = format!("name=\"{}\"", field.to_lowercase());
    let name_pos = raw_lower.find(&needle)?;

    let open_tag_pos = raw_lower[name_pos..].find('>')? + name_pos;
    let close_tag_pos = raw_lower[open_tag_pos + 1..].find("</data>")? + open_tag_pos + 1;

    Some(raw_line[open_tag_pos + 1..close_tag_pos].to_string())
}

fn extract_field_for_quick_check(
    event: &SigmaEventIn,
    field: &str,
    cache: &mut HashMap<String, String>,
) -> String {
    if let Some(cached) = cache.get(field) {
        return cached.clone();
    }

    let lower_field = field.to_lowercase();

    let value = if lower_field == "message" {
        event.message.clone().unwrap_or_default()
    } else if lower_field == "hostname" || lower_field == "host" {
        event
            .host
            .clone()
            .or_else(|| event.computer.clone())
            .unwrap_or_default()
    } else if lower_field == "processname" {
        event.process_name.clone().unwrap_or_default()
    } else if lower_field == "processcmd" || lower_field == "commandline" {
        event.process_cmd.clone().unwrap_or_default()
    } else if let Some(event_data) = &event.event_data {
        if let Some(exact) = event_data.get(field) {
            exact.clone()
        } else {
            let mut found = String::new();
            for (k, v) in event_data {
                if k.to_lowercase() == lower_field {
                    found = v.clone();
                    break;
                }
            }
            found
        }
    } else {
        String::new()
    };

    let final_value = if value.is_empty() {
        if let Some(raw_line) = &event.raw_line {
            extract_data_name_value(raw_line, field).unwrap_or_default()
        } else {
            String::new()
        }
    } else {
        value
    };

    let final_value = final_value.to_lowercase();

    cache.insert(field.to_string(), final_value.clone());
    final_value
}

fn quick_reject_check(
    event: &SigmaEventIn,
    filters: &[SigmaQuickFilterIn],
    cache: &mut HashMap<String, String>,
) -> bool {
    if filters.is_empty() {
        return true;
    }

    let mut any_field_present = false;

    for filter in filters {
        let field_value = extract_field_for_quick_check(event, &filter.field, cache);
        if field_value.is_empty() {
            continue;
        }

        any_field_present = true;
        for target_value in &filter.values {
            let matches = match filter.r#type.as_str() {
                "endswith" => field_value.ends_with(target_value),
                "contains" => field_value.contains(target_value),
                "startswith" => field_value.starts_with(target_value),
                "equals" => field_value == *target_value,
                _ => false,
            };

            if matches {
                return true;
            }
        }
    }

    if !any_field_present {
        return true;
    }

    false
}

pub fn run_sigma_prefilter(
    events: &[SigmaEventIn],
    rules: &[SigmaRulePrefilterIn],
    emit_every: usize,
    mut progress_cb: Option<&mut dyn FnMut(SigmaProgressEventOut)>,
) -> SigmaPrefilterResultOut {
    let started = std::time::Instant::now();
    let normalized_rules: Vec<SigmaRulePrefilterIn> = rules
        .iter()
        .map(|r| SigmaRulePrefilterIn {
            id: r.id.clone(),
            filters: r
                .filters
                .iter()
                .map(|f| SigmaQuickFilterIn {
                    field: f.field.clone(),
                    r#type: f.r#type.clone(),
                    values: f.values.iter().map(|v| v.to_lowercase()).collect(),
                })
                .collect(),
        })
        .collect();

    let total = (events.len() as u64) * (normalized_rules.len() as u64);

    let mut processed: u64 = 0;
    let mut quick_rejects: u64 = 0;
    let mut candidate_comparisons: u64 = 0;
    let mut candidates_found: u64 = 0;
    let mut per_rule_candidates: Vec<Vec<u32>> = vec![Vec::new(); normalized_rules.len()];

    for (event_index, event) in events.iter().enumerate() {
        let mut cache: HashMap<String, String> = HashMap::new();

        for (rule_index, rule) in normalized_rules.iter().enumerate() {
            let pass = quick_reject_check(event, &rule.filters, &mut cache);
            processed += 1;

            if pass {
                candidate_comparisons += 1;
                per_rule_candidates[rule_index].push(event_index as u32);
                candidates_found += 1;
            } else {
                quick_rejects += 1;
            }

            if emit_every > 0 && processed % (emit_every as u64) == 0 {
                if let Some(cb) = progress_cb.as_mut() {
                    cb(SigmaProgressEventOut {
                        processed,
                        total,
                        quick_rejects,
                        candidates_found,
                    });
                }
            }
        }
    }

    let out: Vec<SigmaRuleCandidatesOut> = normalized_rules
        .iter()
        .enumerate()
        .map(|(idx, rule)| SigmaRuleCandidatesOut {
            rule_id: rule.id.clone(),
            event_indices: per_rule_candidates[idx].clone(),
        })
        .collect();

    if let Some(cb) = progress_cb.as_mut() {
        cb(SigmaProgressEventOut {
            processed: total,
            total,
            quick_rejects,
            candidates_found,
        });
    }

    SigmaPrefilterResultOut {
        candidates: out,
        stats: SigmaPrefilterStatsOut {
            total_comparisons: total,
            quick_rejects,
            candidate_comparisons,
            processing_time_ms: started.elapsed().as_secs_f64() * 1000.0,
        },
    }
}

#[tauri::command]
pub fn sigma_prefilter_native(
    window: tauri::Window,
    events: Vec<SigmaEventIn>,
    rules: Vec<SigmaRulePrefilterIn>,
    emit_every: Option<usize>,
) -> Result<SigmaPrefilterResultOut, String> {
    let mut callback = |payload: SigmaProgressEventOut| {
        let _ = window.emit("sigma-native-progress", payload);
    };

    Ok(run_sigma_prefilter(
        &events,
        &rules,
        emit_every.unwrap_or(10_000),
        Some(&mut callback),
    ))
}

pub fn build_synthetic_sigma_data(
    event_count: usize,
    rule_count: usize,
) -> (Vec<SigmaEventIn>, Vec<SigmaRulePrefilterIn>) {
    let mut events = Vec::with_capacity(event_count);
    let mut rules = Vec::with_capacity(rule_count);

    for i in 0..event_count {
        let is_suspicious = i % 37 == 0;
        events.push(SigmaEventIn {
            raw_line: Some(format!(
                "<Data Name=\"Image\">C:\\Windows\\System32\\{}</Data><Data Name=\"CommandLine\">{} /c {}</Data>",
                if is_suspicious { "powershell.exe" } else { "cmd.exe" },
                if is_suspicious { "powershell.exe" } else { "cmd.exe" },
                if is_suspicious { "invoke-expression whoami" } else { "echo ok" },
            )),
            message: Some(if is_suspicious {
                "Suspicious script execution detected".to_string()
            } else {
                "Process created".to_string()
            }),
            process_name: Some(if is_suspicious {
                "powershell.exe".to_string()
            } else {
                "cmd.exe".to_string()
            }),
            process_cmd: Some(if is_suspicious {
                "powershell.exe -enc AAAA".to_string()
            } else {
                "cmd.exe /c echo ok".to_string()
            }),
            source: Some("Microsoft-Windows-Sysmon".to_string()),
            host: Some("LAB-WS01".to_string()),
            computer: Some("LAB-WS01".to_string()),
            event_data: Some(HashMap::from([
                (
                    "Image".to_string(),
                    if is_suspicious {
                        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
                            .to_string()
                    } else {
                        "C:\\Windows\\System32\\cmd.exe".to_string()
                    },
                ),
                (
                    "CommandLine".to_string(),
                    if is_suspicious {
                        "powershell.exe -nop -w hidden invoke-expression".to_string()
                    } else {
                        "cmd.exe /c echo ok".to_string()
                    },
                ),
            ])),
        });
    }

    for i in 0..rule_count {
        let keyword = if i % 4 == 0 {
            "powershell"
        } else if i % 4 == 1 {
            "invoke-expression"
        } else if i % 4 == 2 {
            "cmd.exe"
        } else {
            "whoami"
        };

        rules.push(SigmaRulePrefilterIn {
            id: format!("synthetic-rule-{}", i),
            filters: vec![
                SigmaQuickFilterIn {
                    field: "Image".to_string(),
                    r#type: "contains".to_string(),
                    values: vec![keyword.to_string()],
                },
                SigmaQuickFilterIn {
                    field: "CommandLine".to_string(),
                    r#type: "contains".to_string(),
                    values: vec![keyword.to_string()],
                },
            ],
        });
    }

    (events, rules)
}
