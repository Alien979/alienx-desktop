/**
 * Build a map of ProcessGUID → network activity from Sysmon events.
 * EID 3 = Network Connection, EID 22 = DNS Query.
 */
import type { LogEntry } from "../types";

export interface ProcessConnection {
  destinationIp: string;
  destinationPort: string;
  destinationHostname: string;
  protocol: string;
  timestamp: Date;
  initiated: boolean;
}

export interface ProcessDnsQuery {
  queryName: string;
  queryResults: string;
  timestamp: Date;
}

export interface ProcessNetworkInfo {
  processGuid: string;
  image: string;
  connections: ProcessConnection[];
  dnsQueries: ProcessDnsQuery[];
}

function field(entry: LogEntry, name: string): string {
  if (entry.eventData?.[name]) return entry.eventData[name];
  if (!entry.rawLine) return "";
  const m = entry.rawLine.match(
    new RegExp(`<Data Name="${name}">([^<]*)</Data>`, "i"),
  );
  return m ? m[1] : "";
}

/**
 * Build mapping of ProcessGUID → network activity.
 * Only includes processes that have at least one connection or DNS query.
 */
export function buildProcessNetworkMap(
  entries: LogEntry[],
): Map<string, ProcessNetworkInfo> {
  const map = new Map<string, ProcessNetworkInfo>();

  for (const entry of entries) {
    const eid = entry.eventId;
    if (eid !== 3 && eid !== 22) continue;

    const guid = field(entry, "ProcessGuid") || field(entry, "ProcessGUID");
    if (!guid) continue;

    if (!map.has(guid)) {
      map.set(guid, {
        processGuid: guid,
        image: field(entry, "Image"),
        connections: [],
        dnsQueries: [],
      });
    }
    const info = map.get(guid)!;

    if (eid === 3) {
      info.connections.push({
        destinationIp:
          field(entry, "DestinationIp") || field(entry, "DestinationIP"),
        destinationPort: field(entry, "DestinationPort"),
        destinationHostname: field(entry, "DestinationHostname"),
        protocol: field(entry, "Protocol"),
        timestamp: entry.timestamp,
        initiated: field(entry, "Initiated") === "true",
      });
    }

    if (eid === 22) {
      info.dnsQueries.push({
        queryName: field(entry, "QueryName"),
        queryResults: field(entry, "QueryResults"),
        timestamp: entry.timestamp,
      });
    }
  }

  return map;
}

/** Summarise unique external destinations across all processes. */
export function getExternalDestinations(
  networkMap: Map<string, ProcessNetworkInfo>,
): {
  ip: string;
  port: string;
  processCount: number;
  connectionCount: number;
}[] {
  const destMap = new Map<
    string,
    { ports: Set<string>; processes: Set<string>; count: number }
  >();

  for (const [, info] of networkMap) {
    for (const conn of info.connections) {
      const key = conn.destinationIp;
      if (!key) continue;
      if (!destMap.has(key)) {
        destMap.set(key, { ports: new Set(), processes: new Set(), count: 0 });
      }
      const d = destMap.get(key)!;
      d.ports.add(conn.destinationPort);
      d.processes.add(info.image);
      d.count++;
    }
  }

  return Array.from(destMap.entries())
    .map(([ip, d]) => ({
      ip,
      port: Array.from(d.ports).join(", "),
      processCount: d.processes.size,
      connectionCount: d.count,
    }))
    .sort((a, b) => b.connectionCount - a.connectionCount);
}
