/**
 * Data Formatter for LLM Prompts
 * 
 * Formats SIGMA matches, timeline data, and parsed EVTX data
 * into a structured prompt for LLM analysis
 */

import { ParsedData, LogEntry } from '../../types';
import { SigmaRuleMatch } from '../sigma/types';

export interface FormattedAnalysisData {
  systemPrompt: string;
  userPrompt: string;
  attachments: {
    datasetSummary: string;
    sigmaDetections: string;
    timelineSummary: string;
  };
  summary: {
    totalEvents: number;
    totalDetections: number;
    criticalDetections: number;
    highDetections: number;
    timeRange: string;
    uniqueComputers: number;
    uniqueEventIds: number;
  };
}

/**
 * Format SIGMA matches for prompt
 */
function formatSigmaMatches(matches: Map<string, SigmaRuleMatch[]>): string {
  if (matches.size === 0) {
    return 'No SIGMA rule matches found.';
  }

  const sections: string[] = [];
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    informational: 4,
    info: 4,
  };

  // Sort by severity
  const sortedMatches = Array.from(matches.entries()).sort((a, b) => {
    const severityA = a[1][0]?.rule.level || 'medium';
    const severityB = b[1][0]?.rule.level || 'medium';
    return (severityOrder[severityA] || 2) - (severityOrder[severityB] || 2);
  });

  for (const [ruleId, ruleMatches] of sortedMatches) {
    if (ruleMatches.length === 0) continue;

    const rule = ruleMatches[0].rule;
    const severity = rule.level || 'medium';
    const count = ruleMatches.length;

    sections.push(`\n[${severity.toUpperCase()}] ${rule.title}`);
    sections.push(`  Rule ID: ${ruleId}`);
    if (rule.description) {
      sections.push(`  Description: ${rule.description}`);
    }
    sections.push(`  Matches: ${count} event${count > 1 ? 's' : ''}`);

    // Add sample matched events (first 3)
    const sampleEvents = ruleMatches.slice(0, 3);
    if (sampleEvents.length > 0) {
      sections.push(`  Sample Events:`);
      sampleEvents.forEach((match, idx) => {
        const event = match.event as any;
        const timestamp = event.timestamp || match.timestamp || 'Unknown';
        const computer = event.computer || event.Computer || 'N/A';
        const eventId = event.eventId || event.EventID || 'N/A';
        
        sections.push(`    ${idx + 1}. Time: ${timestamp}, Computer: ${computer}, Event ID: ${eventId}`);
        
        // Add matched fields if available
        if (match.selectionMatches) {
          const fieldMatches: string[] = [];
          for (const selMatch of match.selectionMatches) {
            if (selMatch.fieldMatches) {
              for (const fm of selMatch.fieldMatches) {
                if (fm.matched && fm.value) {
                  fieldMatches.push(`${fm.field}=${String(fm.value).substring(0, 100)}`);
                }
              }
            }
          }
          if (fieldMatches.length > 0) {
            sections.push(`       Matched: ${fieldMatches.slice(0, 3).join(', ')}`);
          }
        }
      });
    }

    if (rule.tags && rule.tags.length > 0) {
      sections.push(`  Tags: ${rule.tags.slice(0, 5).join(', ')}`);
    }
  }

  return sections.join('\n');
}

/**
 * Format timeline summary
 */
function formatTimelineSummary(matches: Map<string, SigmaRuleMatch[]>): string {
  if (matches.size === 0) {
    return 'No timeline data available.';
  }

  // Extract all events with timestamps
  const events: Array<{ timestamp: Date; severity: string; rule: string }> = [];
  
  for (const [ruleId, ruleMatches] of matches) {
    for (const match of ruleMatches) {
      const event = match.event as any;
      const timestamp = event.timestamp || match.timestamp;
      if (timestamp) {
        events.push({
          timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp),
          severity: match.rule.level || 'medium',
          rule: match.rule.title || ruleId,
        });
      }
    }
  }

  if (events.length === 0) {
    return 'No timestamped events found.';
  }

  // Sort by timestamp
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const startTime = events[0].timestamp;
  const endTime = events[events.length - 1].timestamp;
  const duration = endTime.getTime() - startTime.getTime();
  const hours = Math.floor(duration / (1000 * 60 * 60));

  // Count by severity
  const bySeverity: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  events.forEach(e => {
    const sev = e.severity.toLowerCase();
    if (bySeverity[sev] !== undefined) {
      bySeverity[sev]++;
    }
  });

  return `
Timeline Summary:
  Time Range: ${startTime.toLocaleString()} to ${endTime.toLocaleString()}
  Duration: ${hours} hours
  Total Events: ${events.length}
  Severity Distribution:
    - Critical: ${bySeverity.critical}
    - High: ${bySeverity.high}
    - Medium: ${bySeverity.medium}
    - Low: ${bySeverity.low}
  Peak Activity: ${events.length > 0 ? 'See detailed analysis' : 'N/A'}
`.trim();
}

/**
 * Format parsed data statistics with detailed analysis
 */
function formatParsedDataStats(data: ParsedData): string {
  const uniqueComputers = new Set(data.entries.map(e => e.computer).filter(Boolean));
  const uniqueEventIds = new Set(data.entries.map(e => e.eventId).filter(Boolean));
  const uniqueIPs = new Set(data.entries.map(e => e.ip).filter(Boolean));
  const uniqueSources = new Set(data.entries.map(e => e.source).filter(Boolean));

  // Get time range
  const timestamps = data.entries
    .map(e => e.timestamp)
    .filter(t => t && !isNaN(t.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const startTime = timestamps[0];
  const endTime = timestamps[timestamps.length - 1];
  const duration = endTime && startTime ? (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60) : 0;

  // Event ID distribution (top 10)
  const eventIdCounts = new Map<number, number>();
  data.entries.forEach(e => {
    if (e.eventId) {
      eventIdCounts.set(e.eventId, (eventIdCounts.get(e.eventId) || 0) + 1);
    }
  });
  const topEventIds = Array.from(eventIdCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Computer activity distribution (top 10)
  const computerCounts = new Map<string, number>();
  data.entries.forEach(e => {
    if (e.computer) {
      computerCounts.set(e.computer, (computerCounts.get(e.computer) || 0) + 1);
    }
  });
  const topComputers = Array.from(computerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Source/Provider distribution
  const sourceCounts = new Map<string, number>();
  data.entries.forEach(e => {
    if (e.source) {
      sourceCounts.set(e.source, (sourceCounts.get(e.source) || 0) + 1);
    }
  });
  const topSources = Array.from(sourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  let stats = `
Log File Statistics:
  Format: ${data.format.toUpperCase()}
  Total Events: ${data.entries.length}
  Parsed Lines: ${data.parsedLines} / ${data.totalLines}
  ${data.format === 'evtx' ? `Unique Computers: ${uniqueComputers.size}` : `Unique IPs: ${uniqueIPs.size}`}
  ${data.format === 'evtx' ? `Unique Event IDs: ${uniqueEventIds.size}` : ''}
  ${data.format === 'evtx' ? `Unique Sources/Providers: ${uniqueSources.size}` : ''}
  Time Range: ${startTime ? startTime.toLocaleString() : 'N/A'} to ${endTime ? endTime.toLocaleString() : 'N/A'}
  Duration: ${duration > 0 ? `${duration.toFixed(1)} hours` : 'N/A'}
`;

  if (data.format === 'evtx' && topEventIds.length > 0) {
    stats += `\n\nTop 10 Event IDs by Frequency:`;
    topEventIds.forEach(([eventId, count]) => {
      stats += `\n  Event ID ${eventId}: ${count} occurrences`;
    });
  }

  if (data.format === 'evtx' && topComputers.length > 0) {
    stats += `\n\nTop 10 Most Active Computers:`;
    topComputers.forEach(([computer, count]) => {
      stats += `\n  ${computer}: ${count} events`;
    });
  }

  if (topSources.length > 0) {
    stats += `\n\nTop 10 Event Sources/Providers:`;
    topSources.forEach(([source, count]) => {
      stats += `\n  ${source}: ${count} events`;
    });
  }

  return stats.trim();
}

/**
 * Format sample suspicious events from SIGMA matches
 * @deprecated Currently unused, kept for future use
 */
// @ts-ignore - Unused function kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatSampleEvents(data: ParsedData, matches: Map<string, SigmaRuleMatch[]>, maxEvents: number = 10): string {
  // Get events that matched SIGMA rules, sorted by severity
  const matchedEvents: Array<{ entry: LogEntry; severity: string; rule: string }> = [];

  for (const [, ruleMatches] of matches) {
    for (const match of ruleMatches) {
      const event = match.event as any;
      // Try to find corresponding LogEntry
      const entry = data.entries.find(e => {
        if (data.format === 'evtx') {
          return e.eventId === (event.eventId || event.EventID) &&
                 e.timestamp.getTime() === new Date(event.timestamp || match.timestamp).getTime();
        }
        return false;
      });

      if (entry) {
        matchedEvents.push({
          entry,
          severity: match.rule.level || 'medium',
          rule: match.rule.title || 'Unknown',
        });
      }
    }
  }

  if (matchedEvents.length === 0) {
    return 'No SIGMA rule matches found.';
  }

  // Sort by severity and take top N
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  matchedEvents.sort((a, b) => {
    const orderA = severityOrder[a.severity] ?? 2;
    const orderB = severityOrder[b.severity] ?? 2;
    return orderA - orderB;
  });

  const samples = matchedEvents.slice(0, maxEvents);
  const sections: string[] = ['SIGMA Rule Matches (Sample Events):'];

  samples.forEach((item, idx) => {
    const e = item.entry;
    sections.push(`\n${idx + 1}. [${item.severity.toUpperCase()}] ${item.rule}`);
    sections.push(`   Time: ${e.timestamp.toLocaleString()}`);
    if (data.format === 'evtx') {
      sections.push(`   Computer: ${e.computer || 'N/A'}`);
      sections.push(`   Event ID: ${e.eventId || 'N/A'}`);
      sections.push(`   Source: ${e.source || 'N/A'}`);
    if (e.message) {
      const msg = truncate(e.message, 200);
      sections.push(`   Message: ${msg}`);
    }
    } else {
      sections.push(`   IP: ${e.ip}`);
      sections.push(`   Method: ${e.method} ${e.path}`);
      sections.push(`   Status: ${e.statusCode}`);
    }
  });

  return sections.join('\n');
}

/**
 * Format additional suspicious events from full dataset
 * These are events that may be suspicious but didn't match SIGMA rules
 * @deprecated Currently unused, kept for future use
 */
// @ts-ignore - Unused function kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatAdditionalSuspiciousEvents(data: ParsedData, matches: Map<string, SigmaRuleMatch[]>, maxEvents: number = 15): string {
  if (data.format !== 'evtx') {
    return '';
  }

  // Get event IDs that matched SIGMA rules
  const matchedEventIds = new Set<number>();
  for (const [, ruleMatches] of matches) {
    for (const match of ruleMatches) {
      const event = match.event as any;
      const eventId = event.eventId || event.EventID;
      if (eventId) {
        matchedEventIds.add(eventId);
      }
    }
  }

  // Suspicious Event IDs to look for (common security-relevant events)
  const suspiciousEventIds = [
    4624, // Successful logon
    4625, // Failed logon
    4648, // Logon with explicit credentials
    4672, // Admin logon
    4688, // Process creation
    4697, // Service installation
    4698, // Scheduled task creation
    4700, // Scheduled task enabled
    4702, // Scheduled task updated
    4719, // System audit policy changed
    4720, // User account created
    4724, // Attempt to reset password
    4728, // Member added to security-enabled global group
    4732, // Member added to security-enabled local group
    4740, // User account locked
    4768, // Kerberos authentication ticket requested
    4769, // Kerberos service ticket requested
    4776, // Credential validation
    5140, // Network share accessed
    5142, // Network share object added
    5143, // Network share object modified
    5144, // Network share object deleted
    5156, // Windows Filtering Platform connection
    5157, // Windows Filtering Platform blocked connection
    5158, // Windows Filtering Platform permit
    7045, // Service installed
    1102, // Audit log cleared
    1104, // Security log cleared
  ];

  // Find events with suspicious Event IDs that didn't match SIGMA rules
  const additionalEvents: LogEntry[] = [];
  for (const entry of data.entries) {
    if (entry.eventId && suspiciousEventIds.includes(entry.eventId)) {
      // Check if this event was already matched by SIGMA
      const wasMatched = matchedEventIds.has(entry.eventId);
      if (!wasMatched) {
        additionalEvents.push(entry);
      }
    }
  }

  if (additionalEvents.length === 0) {
    return '';
  }

  // Sort by timestamp (most recent first) and take top N
  const sorted = additionalEvents
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, maxEvents);

  const sections: string[] = ['\nAdditional Suspicious Events (Not Matched by SIGMA Rules):'];
  sections.push('These events have security-relevant Event IDs but did not match any SIGMA detection rules.');
  sections.push('They may indicate additional suspicious activity worth investigating.\n');

  sorted.forEach((entry, idx) => {
    sections.push(`\n${idx + 1}. Event ID ${entry.eventId} - ${entry.source || 'Unknown Source'}`);
    sections.push(`   Time: ${entry.timestamp.toLocaleString()}`);
    sections.push(`   Computer: ${entry.computer || 'N/A'}`);
    if (entry.message) {
      const msg = truncate(entry.message, 200);
      sections.push(`   Message: ${msg}`);
    }
  });

  return sections.join('\n');
}

/**
 * Format dataset patterns and anomalies for LLM analysis
 * @deprecated Currently unused, kept for future use
 */
// @ts-ignore - Unused function kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDatasetPatterns(data: ParsedData, matches: Map<string, SigmaRuleMatch[]>): string {
  if (data.format !== 'evtx') {
    return '';
  }

  const sections: string[] = [];
  sections.push('\nDataset Patterns & Anomalies:');

  // Get computers involved in SIGMA matches
  const sigmaComputers = new Set<string>();
  for (const [, ruleMatches] of matches) {
    for (const match of ruleMatches) {
      const event = match.event as any;
      const computer = event.computer || event.Computer;
      if (computer) {
        sigmaComputers.add(computer);
      }
    }
  }

  if (sigmaComputers.size > 0) {
    sections.push(`\nComputers with SIGMA detections: ${Array.from(sigmaComputers).join(', ')}`);
    sections.push('Investigate these systems for related suspicious activity.');
  }

  // Find events on same computers as SIGMA matches (potential related activity)
  const relatedEvents: LogEntry[] = [];
  for (const entry of data.entries) {
    if (entry.computer && sigmaComputers.has(entry.computer)) {
      // Check if this event was already in SIGMA matches
      let isSigmaMatch = false;
      for (const [, ruleMatches] of matches) {
        for (const match of ruleMatches) {
          const event = match.event as any;
          if (entry.eventId === (event.eventId || event.EventID) &&
              entry.timestamp.getTime() === new Date(event.timestamp || match.timestamp).getTime()) {
            isSigmaMatch = true;
            break;
          }
        }
        if (isSigmaMatch) break;
      }
      if (!isSigmaMatch && entry.eventId) {
        relatedEvents.push(entry);
      }
    }
  }

  if (relatedEvents.length > 0) {
    sections.push(`\nFound ${relatedEvents.length} additional events on computers with SIGMA detections.`);
    sections.push('These may be related to the detected threats and warrant investigation.');
  }

  // Time-based patterns
  const timestamps = data.entries
    .map(e => e.timestamp)
    .filter(t => t && !isNaN(t.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (timestamps.length > 0) {
    // Find events in time windows around SIGMA matches (1 hour before/after)
    const sigmaTimeWindows = new Set<number>();
    for (const [, ruleMatches] of matches) {
      for (const match of ruleMatches) {
        const event = match.event as any;
        const timestamp = event.timestamp || match.timestamp;
        if (timestamp) {
          const time = new Date(timestamp).getTime();
          // Create 1-hour windows
          const windowStart = Math.floor(time / (1000 * 60 * 60)) * (1000 * 60 * 60);
          sigmaTimeWindows.add(windowStart);
        }
      }
    }

    if (sigmaTimeWindows.size > 0) {
      sections.push(`\nTime windows with SIGMA detections: ${sigmaTimeWindows.size} distinct periods`);
      sections.push('Investigate events occurring in these time windows for related activity.');
    }
  }

  // Event ID frequency anomalies
  const eventIdCounts = new Map<number, number>();
  data.entries.forEach(e => {
    if (e.eventId) {
      eventIdCounts.set(e.eventId, (eventIdCounts.get(e.eventId) || 0) + 1);
    }
  });

  // Find unusually frequent event IDs (more than 10% of total)
  const totalEvents = data.entries.length;
  const frequentEventIds: Array<{ eventId: number; count: number; percentage: number }> = [];
  eventIdCounts.forEach((count, eventId) => {
    const percentage = (count / totalEvents) * 100;
    if (percentage > 10 && count > 50) {
      frequentEventIds.push({ eventId, count, percentage });
    }
  });

  if (frequentEventIds.length > 0) {
    sections.push('\nUnusually Frequent Event IDs (may indicate patterns):');
    frequentEventIds
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5)
      .forEach(({ eventId, count, percentage }) => {
        sections.push(`  Event ID ${eventId}: ${count} occurrences (${percentage.toFixed(1)}% of total)`);
      });
  }

  return sections.join('\n');
}

/**
 * Main formatter function
 */
export function formatDataForLLM(
  matches: Map<string, SigmaRuleMatch[]>,
  data: ParsedData,
  customPrompt?: string
): FormattedAnalysisData {
  const sigmaSection = formatSigmaMatches(matches);
  const timelineSection = formatTimelineSummary(matches);
  const statsSection = formatParsedDataStats(data);

  const totalDetections = Array.from(matches.values()).reduce((sum, m) => sum + m.length, 0);
  const criticalDetections = Array.from(matches.values())
    .flat()
    .filter(m => m.rule.level === 'critical').length;
  const highDetections = Array.from(matches.values())
    .flat()
    .filter(m => m.rule.level === 'high').length;

  const timestamps = data.entries
    .map(e => e.timestamp)
    .filter(t => t && !isNaN(t.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const uniqueComputers = new Set(data.entries.map(e => e.computer).filter(Boolean));
  const uniqueEventIds = new Set(data.entries.map(e => e.eventId).filter(Boolean));

  const systemPrompt = `You are a SEASONED DIGITAL FORENSICS AND INCIDENT RESPONSE (DFIR) EXPERT with 15+ years of experience investigating complex security incidents, analyzing Windows Event Logs, and hunting advanced persistent threats (APTs). You have deep expertise in:

- **Kill Chain Analysis**: MITRE ATT&CK framework, attack progression, and lateral movement
- **Timeline Reconstruction**: Building complete attack narratives from log artifacts
- **Threat Hunting**: Finding subtle indicators that automated tools miss
- **Forensic Analysis**: Understanding Windows Event Log nuances, Event ID meanings, and system behavior
- **Incident Response**: Prioritizing findings, determining scope, and providing actionable containment strategies

**Your DFIR Investigation Methodology:**

1. **Comprehensive Log Analysis**: Treat this as a real incident investigation. Analyze the ENTIRE dataset systematically, not just automated detections. Your job is to find what the tools missed.

**Your Analysis Style:**
- Think like an adversary: What would an attacker do next?
- Connect the dots: How do seemingly unrelated events form a pattern?
- Be thorough: Leave no stone unturned
- Be precise: Provide specific Event IDs, timestamps, and system names
- Be actionable: Every finding should lead to a response action

Remember: You're not just analyzing logs—you're investigating a potential security incident. Your analysis could be used in legal proceedings, so be thorough, accurate, and document everything.`;

  const userPrompt = customPrompt || `You are investigating a potential security incident. Use the system instructions to produce a concise DFIR analysis based on the analysis summaries below.

DATASET SUMMARY
${statsSection}

SIGMA DETECTIONS
${sigmaSection}

TIMELINE SUMMARY
${timelineSection}
`;


  return {
    systemPrompt,
    userPrompt,
    attachments: {
      datasetSummary: statsSection,
      sigmaDetections: sigmaSection,
      timelineSummary: timelineSection,
    },
    summary: {
      totalEvents: data.entries.length,
      totalDetections,
      criticalDetections,
      highDetections,
      timeRange: timestamps.length > 0
        ? `${timestamps[0].toLocaleString()} to ${timestamps[timestamps.length - 1].toLocaleString()}`
        : 'N/A',
      uniqueComputers: uniqueComputers.size,
      uniqueEventIds: uniqueEventIds.size,
    },
  };
}
// Truncate long strings for prompt compactness
function truncate(str: string, max = 400): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}
