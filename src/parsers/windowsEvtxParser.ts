import { LogEntry } from "../types";
import { PlatformLogParser } from "./types";

function getLevelName(level: string): string {
  const levelMap: Record<string, string> = {
    "0": "LogAlways",
    "1": "Critical",
    "2": "Error",
    "3": "Warning",
    "4": "Information",
    "5": "Verbose",
  };
  return levelMap[level] || level;
}

export function parseWindowsEvtxXml(
  content: string,
  onProgress?: (processed: number, total: number) => void,
  sourcePath?: string,
): LogEntry[] {
  const entries: LogEntry[] = [];
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, "text/xml");
  const parserError = xmlDoc.querySelector("parsererror");

  if (parserError) {
    throw new Error(
      `XML parsing failed: ${parserError.textContent || "Unknown parser error"}`,
    );
  }

  const events = xmlDoc.querySelectorAll("Event");
  const totalEvents = events.length;
  if (onProgress) onProgress(0, totalEvents);

  events.forEach((event, index) => {
    try {
      const system = event.querySelector("System");
      if (!system) return;

      const eventIdElem = system.querySelector("EventID");
      const levelElem = system.querySelector("Level");
      const timeCreatedElem = system.querySelector("TimeCreated");
      const computerElem = system.querySelector("Computer");
      const providerElem = system.querySelector("Provider");

      const eventDataMap: Record<string, string> = {};
      let ip = "N/A";

      const dataElements = event.querySelectorAll("Data");
      dataElements.forEach((data) => {
        const name = data.getAttribute("Name");
        const value = data.textContent || "";
        if (!name) return;

        eventDataMap[name] = value;

        if (
          name.includes("IpAddress") ||
          name.includes("IPAddress") ||
          name.includes("SourceAddress") ||
          name.includes("ClientIP")
        ) {
          ip = value;
        }
      });

      let eventId = eventIdElem
        ? parseInt(eventIdElem.textContent || "0", 10)
        : 0;
      if (isNaN(eventId)) eventId = 0;

      const level = levelElem
        ? levelElem.textContent || "Information"
        : "Information";
      const levelName = getLevelName(level);

      let timestamp = new Date();
      if (timeCreatedElem) {
        const systemTime = timeCreatedElem.getAttribute("SystemTime");
        if (systemTime) {
          const parsedDate = new Date(systemTime);
          if (!isNaN(parsedDate.getTime())) {
            timestamp = parsedDate;
          }
        }
      }

      const computer = computerElem
        ? computerElem.textContent || "Unknown"
        : "Unknown";
      const source = providerElem
        ? providerElem.getAttribute("Name") || "Unknown"
        : "Unknown";

      if (ip === "N/A" && computer !== "Unknown") {
        ip = computer;
      }

      const message = Object.entries(eventDataMap)
        .filter(([, value]) => Boolean(value))
        .map(([name, value]) => `${name}=${value}`)
        .join(", ");

      let rawLine = "";
      try {
        rawLine = new XMLSerializer().serializeToString(event);
      } catch {
        rawLine = event.textContent || "";
      }

      entries.push({
        timestamp,
        ip,
        method: source.substring(0, 20),
        path: `Event ${eventId}`,
        statusCode: eventId,
        size: 0,
        rawLine,
        eventId,
        level: levelName,
        source,
        computer,
        host: computer,
        message,
        eventData: Object.keys(eventDataMap).length ? eventDataMap : undefined,
        sourceFile: sourcePath,
        platform: "windows",
        sourceType: "evtx-xml",
      });

      if (onProgress && (index + 1) % 100 === 0) {
        onProgress(index + 1, totalEvents);
      }
    } catch {
      // Skip malformed events and continue parsing.
    }
  });

  if (onProgress) onProgress(totalEvents, totalEvents);
  return entries;
}

export const windowsEvtxParser: PlatformLogParser = {
  id: "evtx",
  platform: "windows",
  canParse: (fileName: string, sample: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".xml") || lower.endsWith(".evtx")) {
      return (
        sample.trim().startsWith("<?xml") ||
        sample.includes("<Events>") ||
        sample.includes("<Event ")
      );
    }
    return false;
  },
  parse: (content, meta, onProgress) =>
    parseWindowsEvtxXml(content, onProgress, meta.sourcePath),
};
