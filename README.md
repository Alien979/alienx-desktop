# AlienX

**AlienX** is a browser-based Digital Forensics and Incident Response (DFIR) / threat-hunting workbench that runs entirely client-side — no server, no data uploads, no installations. Drop in a Windows Event Log or Linux log file and get immediate detection results, visualisations, and AI-assisted analysis.

---

## Features

### Log Ingestion

| Format                    | Notes                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| Windows EVTX (binary)     | Parsed in-browser via a WebAssembly EVTX parser                        |
| Windows EVTX (XML export) | Drop an XML-formatted event log                                        |
| Linux log files           | Syslog, auth.log, kern.log, /var/log/\* and similar plain-text formats |
| Multi-file drag-and-drop  | Load several files at once and analyse them together                   |

Built-in samples (EVTX attack samples from the community) are available via the **Load Sample** button so you can explore the tool without your own log files.

---

### Analysis Modes

#### Sigma Detections

Runs all applicable SigmaHQ rules against every loaded event. Results are grouped by rule and show:

- Expandable hit cards with matched event details
- "Why matched?" — the exact field values that triggered each rule
- Per-rule and per-file event counts
- MITRE ATT&CK technique / tactic badges
- File source filter and virtual-scroll pagination

**Rule counts (bundled at build time):**

- Windows: ~2 384 rules across 17 categories
- Linux: ~207 rules across 5 categories

#### YARA Detections

Scans every event's raw text against a bundled YARA rule set compiled from multiple community sources:

- Expandable signature cards showing matched string literals
- Per-file breakdown and source-attribution badges
- Full rule metadata (author, description, tags)

**Bundled YARA sources:**

| Source                   | Repository                                                |
| ------------------------ | --------------------------------------------------------- |
| Yara-Rules               | https://github.com/Yara-Rules/rules                       |
| Neo23x0 Signature-Base   | https://github.com/Neo23x0/signature-base                 |
| ReversingLabs            | https://github.com/reversinglabs/reversinglabs-yara-rules |
| Advanced Threat Research | https://github.com/advanced-threat-research/Yara-Rules    |
| Elastic Protections      | https://github.com/elastic/protections-artifacts          |
| bartblaze Yara-Rules     | https://github.com/bartblaze/Yara-Rules                   |
| InQuest Community Rules  | https://github.com/InQuest/yara-rules                     |
| Malpedia Signator Rules  | https://github.com/malpedia/signator-rules                |

#### Statistical Dashboards

Charts and aggregate statistics over the loaded events:

- Event count over time (histogram)
- Top EventIDs, top hosts, top users
- Severity / criticality distribution
- Multi-file comparison view

#### Process Execution Analysis

Deep-dive view for process creation events (Windows Sysmon EID 1 / Security EID 4688 and Linux equivalents):

- Process tree visualisation
- Command-line argument breakdown
- Parent–child chain inspection

#### Investigation Timeline

Chronological timeline of all events with adjustable zoom and filtering by severity, source file, or keyword.

#### Raw Logs View

Searchable, sortable table of every parsed log entry with column toggles and per-row event detail popup.

#### IOC Extraction

Automatically extracts Indicators of Compromise from all log data:

- **Types detected:** IP addresses, domain names, file hashes (MD5/SHA1/SHA256), URLs, email addresses
- **Threat intelligence:** Live AbuseIPDB lookups (bring your own API key — never sent to our servers)
- **Export:** STIX 2.1 bundle for use in other tools

#### Event Correlation

Groups causally-related events across different source files using process GUIDs, session IDs, and temporal proximity to surface attack chains that span multiple log files.

#### AI Analysis

Chat with your log data using a large language model:

- Supports **OpenAI** (GPT-4o / GPT-4), **Anthropic** (Claude), and **Google** (Gemini) — your choice
- API keys are stored only in your browser's `localStorage` and are never transmitted anywhere except directly to the selected LLM provider
- Conversation history is preserved across sessions

---

### Additional Features

- **Bookmarks** — flag interesting events and review them in a side panel
- **Sessions** — save the full analysis state to a local JSON file and restore it later
- **Export Reports** — generate HTML or PDF incident reports with selected findings
- **MITRE ATT&CK Heatmap** — visualise technique coverage across matched Sigma rules
- **Dark / Light theme** — persisted per browser
- **Triage scoring** — automatic severity score per event based on matched rules

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Git](https://git-scm.com) (needed by the rule-sync scripts)

### Quick start

```bash
git clone https://github.com/Alien979/alienx.git
cd alienx
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Refresh detection rules

Pull the latest Sigma and YARA community rules, re-bundle them, and rebuild the app:

```bash
npm run refresh:rules   # sync + bundle rules only
npm run build           # full production build (includes refresh)
```

Individual rule commands:

```bash
npm run sync:sigma      # pull latest SigmaHQ rules
npm run bundle:sigma    # compile YAML rules → JSON bundles
npm run sync:yara       # pull latest YARA community repos
npm run bundle:yara     # compile .yar/.yara files → JSON bundles
```

> **Note:** `sync:yara` clones several git repositories (≈1–3 GB total) on first run. Subsequent calls do `git pull` instead.

---

## Project Structure

```
alienx/
├── public/
│   ├── sigma-rules/          # Bundled Sigma rules (generated)
│   │   ├── windows/
│   │   └── linux/
│   ├── yara-rules/           # Bundled YARA rules (generated)
│   │   ├── windows.json
│   │   └── linux.json
│   └── samples-manifest.json
├── samples/
│   └── EVTX-ATTACK-SAMPLES/  # Community EVTX attack samples
├── scripts/
│   ├── sync-sigma.js          # Clone / update SigmaHQ
│   ├── bundle-sigma-rules.js  # YAML → JSON bundler
│   ├── sync-yara-rules.js     # Clone / update YARA repos
│   ├── bundle-yara-rules.js   # .yar → structured JSON bundler
│   └── generate-samples-manifest.js
├── src/
│   ├── App.tsx                # Root app & view routing
│   ├── components/            # All UI components
│   ├── lib/
│   │   ├── sigma/             # Sigma rule engine
│   │   ├── yara.ts            # YARA matching engine
│   │   ├── llm/               # LLM provider integrations
│   │   └── ...
│   └── types.ts
└── index.html
```

---

## Tech Stack

| Layer               | Technology                                     |
| ------------------- | ---------------------------------------------- |
| Frontend framework  | React 18 + TypeScript                          |
| Build tool          | Vite 7                                         |
| EVTX binary parsing | WebAssembly (custom WASM module)               |
| Charts              | Recharts                                       |
| PDF generation      | jsPDF                                          |
| ZIP / archive       | JSZip                                          |
| LLM SDKs            | `openai`, `@anthropic-ai/sdk`, `@google/genai` |

---

## Privacy

AlienX processes everything locally in your browser. Log files, event data, and analysis results never leave your machine unless you explicitly:

1. Send a prompt to an LLM provider (data goes to that provider's API only)
2. Perform an AbuseIPDB lookup (only the queried IP is sent)

API keys are stored in `localStorage` and are not included in exported sessions or reports.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on submitting issues and pull requests.

---

## Licence

See [LICENSE](LICENSE) for details.

---

## Acknowledgements

Detection content sourced from the community:

- [SigmaHQ](https://github.com/SigmaHQ/sigma) — Sigma detection rules
- [Yara-Rules](https://github.com/Yara-Rules/rules)
- [Neo23x0 Signature-Base](https://github.com/Neo23x0/signature-base) — Florian Roth
- [ReversingLabs YARA Rules](https://github.com/reversinglabs/reversinglabs-yara-rules)
- [Advanced Threat Research YARA Rules](https://github.com/advanced-threat-research/Yara-Rules) — McAfee / Trellix
- [Elastic Protections](https://github.com/elastic/protections-artifacts)
- [bartblaze Yara-Rules](https://github.com/bartblaze/Yara-Rules)
- [InQuest YARA Rules](https://github.com/InQuest/yara-rules)
- [Malpedia Signator Rules](https://github.com/malpedia/signator-rules)
- [EVTX-ATTACK-SAMPLES](https://github.com/sbousseaden/EVTX-ATTACK-SAMPLES) — log samples
