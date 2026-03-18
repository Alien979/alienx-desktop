/* eslint-disable no-console */

function buildSyntheticData(eventCount, ruleCount) {
  const events = [];
  const rules = [];

  for (let i = 0; i < eventCount; i++) {
    const suspicious = i % 37 === 0;
    events.push({
      rawLine:
        `<Data Name="Image">C:\\Windows\\System32\\${suspicious ? "powershell.exe" : "cmd.exe"}</Data>` +
        `<Data Name="CommandLine">${suspicious ? "powershell.exe" : "cmd.exe"} /c ${suspicious ? "invoke-expression whoami" : "echo ok"}</Data>`,
      message: suspicious
        ? "Suspicious script execution detected"
        : "Process created",
      processName: suspicious ? "powershell.exe" : "cmd.exe",
      processCmd: suspicious
        ? "powershell.exe -nop -w hidden invoke-expression"
        : "cmd.exe /c echo ok",
      source: "Microsoft-Windows-Sysmon",
      host: "LAB-WS01",
      computer: "LAB-WS01",
      eventData: {
        Image: suspicious
          ? "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
          : "C:\\Windows\\System32\\cmd.exe",
        CommandLine: suspicious
          ? "powershell.exe -nop -w hidden invoke-expression"
          : "cmd.exe /c echo ok",
      },
    });
  }

  for (let i = 0; i < ruleCount; i++) {
    const keyword =
      i % 4 === 0
        ? "powershell"
        : i % 4 === 1
          ? "invoke-expression"
          : i % 4 === 2
            ? "cmd.exe"
            : "whoami";

    rules.push({
      id: `synthetic-rule-${i}`,
      filters: [
        { field: "Image", type: "contains", values: [keyword] },
        { field: "CommandLine", type: "contains", values: [keyword] },
      ],
    });
  }

  return { events, rules };
}

function extractField(event, field, cache) {
  if (cache.has(field)) return cache.get(field);

  const lower = field.toLowerCase();
  let value = "";

  if (lower === "message") value = event.message || "";
  else if (lower === "hostname" || lower === "host")
    value = event.host || event.computer || "";
  else if (lower === "processname") value = event.processName || "";
  else if (lower === "processcmd" || lower === "commandline")
    value = event.processCmd || "";
  else if (event.eventData?.[field]) value = event.eventData[field];
  else if (event.eventData) {
    for (const [k, v] of Object.entries(event.eventData)) {
      if (k.toLowerCase() === lower) {
        value = String(v);
        break;
      }
    }
  }

  if (!value && event.rawLine) {
    const regex = new RegExp(`<Data Name="${field}"[^>]*>([^<]*)</Data>`, "i");
    const m = event.rawLine.match(regex);
    if (m) value = m[1];
  }

  cache.set(field, value);
  return value;
}

function quickCheck(event, filters, cache) {
  if (filters.length === 0) return true;

  let anyFieldPresent = false;
  for (const filter of filters) {
    const value = extractField(event, filter.field, cache);
    if (!value) continue;

    anyFieldPresent = true;
    const lowerValue = value.toLowerCase();

    for (const t of filter.values) {
      const target = t.toLowerCase();
      let matched = false;
      if (filter.type === "contains") matched = lowerValue.includes(target);
      else if (filter.type === "endswith")
        matched = lowerValue.endsWith(target);
      else if (filter.type === "startswith")
        matched = lowerValue.startsWith(target);
      else if (filter.type === "equals") matched = lowerValue === target;
      if (matched) return true;
    }
  }

  if (!anyFieldPresent) return true;
  return false;
}

function runTsPrefilter(events, rules) {
  const started = performance.now();
  let quickRejects = 0;
  let candidateComparisons = 0;

  for (const rule of rules) {
    for (const event of events) {
      const cache = new Map();
      const pass = quickCheck(event, rule.filters, cache);
      if (pass) candidateComparisons++;
      else quickRejects++;
    }
  }

  const elapsed = performance.now() - started;
  return {
    totalComparisons: events.length * rules.length,
    candidateComparisons,
    quickRejects,
    processingTimeMs: elapsed,
  };
}

const eventCount = 120000;
const ruleCount = 700;
const { events, rules } = buildSyntheticData(eventCount, ruleCount);

const stats = runTsPrefilter(events, rules);
console.log(
  `ts_sigma_prefilter events=${eventCount} rules=${ruleCount} totalComparisons=${stats.totalComparisons} candidates=${stats.candidateComparisons} quickRejects=${stats.quickRejects} timeMs=${stats.processingTimeMs.toFixed(2)}`,
);
