// Column configuration system for raw logs view
import { LogEntry } from "../types";
import { SigmaRuleMatch } from "./sigma/types";

export type ColumnType =
  | "timestamp"
  | "computer"
  | "eventId"
  | "source"
  | "message"
  | "ip"
  | "statusCode"
  | "method"
  | "path"
  | "sourceFile"
  | "user"
  | "processName"
  | "provider"
  | "sigmaMatches"
  | "custom";

export interface ColumnDef {
  id: string;
  type: ColumnType;
  label: string;
  width: number; // pixels
  visible: boolean;
  sortable: boolean;
  filterable: boolean;
  accessor?: (
    entry: LogEntry,
    sigmaMatches?: Map<string, SigmaRuleMatch[]>,
  ) => string;
}

export interface CustomColumn {
  id: string;
  label: string;
  pattern: string; // regex or field path
}

const DEFAULT_COLUMNS: Record<ColumnType, ColumnDef> = {
  timestamp: {
    id: "timestamp",
    type: "timestamp",
    label: "Timestamp",
    width: 180,
    visible: true,
    sortable: true,
    filterable: true,
  },
  computer: {
    id: "computer",
    type: "computer",
    label: "Computer",
    width: 140,
    visible: true,
    sortable: true,
    filterable: true,
  },
  eventId: {
    id: "eventId",
    type: "eventId",
    label: "Event ID",
    width: 90,
    visible: true,
    sortable: true,
    filterable: true,
  },
  source: {
    id: "source",
    type: "source",
    label: "Provider",
    width: 120,
    visible: true,
    sortable: true,
    filterable: true,
  },
  message: {
    id: "message",
    type: "message",
    label: "Message",
    width: 300,
    visible: true,
    sortable: false,
    filterable: true,
  },
  ip: {
    id: "ip",
    type: "ip",
    label: "IP Address",
    width: 140,
    visible: false,
    sortable: true,
    filterable: true,
  },
  statusCode: {
    id: "statusCode",
    type: "statusCode",
    label: "Status",
    width: 80,
    visible: false,
    sortable: true,
    filterable: true,
  },
  method: {
    id: "method",
    type: "method",
    label: "Method",
    width: 70,
    visible: false,
    sortable: true,
    filterable: true,
  },
  path: {
    id: "path",
    type: "path",
    label: "Path",
    width: 250,
    visible: false,
    sortable: false,
    filterable: true,
  },
  sourceFile: {
    id: "sourceFile",
    type: "sourceFile",
    label: "Source File",
    width: 180,
    visible: false,
    sortable: true,
    filterable: true,
  },
  user: {
    id: "user",
    type: "user",
    label: "User",
    width: 140,
    visible: false,
    sortable: true,
    filterable: true,
  },
  processName: {
    id: "processName",
    type: "processName",
    label: "Process Name",
    width: 160,
    visible: false,
    sortable: true,
    filterable: true,
  },
  provider: {
    id: "provider",
    type: "provider",
    label: "Provider",
    width: 140,
    visible: false,
    sortable: true,
    filterable: true,
  },
  sigmaMatches: {
    id: "sigmaMatches",
    type: "sigmaMatches",
    label: "SIGMA Matches",
    width: 220,
    visible: false,
    sortable: false,
    filterable: false,
  },
  custom: {
    id: "custom",
    type: "custom",
    label: "Custom",
    width: 200,
    visible: false,
    sortable: false,
    filterable: false,
  },
};

const COLUMNS_CONFIG_KEY = "alienx_raw_logs_columns_v1";

export function getDefaultColumns(): ColumnDef[] {
  return Object.values(DEFAULT_COLUMNS);
}

export function getSavedColumnConfig(): ColumnDef[] {
  try {
    const saved = localStorage.getItem(COLUMNS_CONFIG_KEY);
    if (!saved) return getDefaultColumns();
    const parsed = JSON.parse(saved) as ColumnDef[];
    return parsed;
  } catch {
    return getDefaultColumns();
  }
}

export function saveColumnConfig(columns: ColumnDef[]): void {
  localStorage.setItem(COLUMNS_CONFIG_KEY, JSON.stringify(columns));
}

export function getColumnValue(
  entry: LogEntry,
  column: ColumnDef,
  sigmaMatches?: Map<string, SigmaRuleMatch[]>,
): string {
  switch (column.type) {
    case "timestamp":
      return entry.timestamp instanceof Date &&
        !isNaN(entry.timestamp.getTime())
        ? entry.timestamp.toLocaleString()
        : "—";
    case "computer":
      return entry.computer || "—";
    case "eventId":
      return String(entry.eventId || "—");
    case "source":
      return entry.source || "—";
    case "message":
      return entry.message || "—";
    case "ip":
      return entry.ip || "—";
    case "statusCode":
      return String(entry.statusCode || "—");
    case "method":
      return entry.method || "—";
    case "path":
      return entry.path || "—";
    case "sourceFile":
      return entry.sourceFile || "—";
    case "user":
      return entry.user || entry.eventData?.SubjectUserName || "—";
    case "processName": {
      const procName = entry.processName || entry.eventData?.Image || "";
      if (!procName) return "—";
      const parts = procName.split("\\");
      return parts[parts.length - 1];
    }
    case "provider":
      return entry.source || entry.sourceType || "—";
    case "sigmaMatches": {
      if (!sigmaMatches || sigmaMatches.size === 0) return "";
      // sigmaMatches is Map<ruleId, SigmaRuleMatch[]>
      // We need to find all matches for this specific entry
      const matchingRules: string[] = [];
      for (const ruleMatches of sigmaMatches.values()) {
        for (const match of ruleMatches) {
          // Critical fix: use event ID/data comparison instead of === reference comparison
          // This handles filtered entries and recreated objects
          if (
            match.event &&
            entry &&
            JSON.stringify(match.event.rawLine || "") ===
              JSON.stringify(entry.rawLine || "") &&
            JSON.stringify(match.event.timestamp) ===
              JSON.stringify(entry.timestamp)
          ) {
            matchingRules.push(match.rule.title);
          }
        }
      }
      return matchingRules.length > 0 ? matchingRules.join(", ") : "";
    }
    default:
      return "—";
  }
}

export function updateColumnWidth(
  columns: ColumnDef[],
  columnId: string,
  newWidth: number,
): ColumnDef[] {
  return columns.map((col) =>
    col.id === columnId ? { ...col, width: Math.max(50, newWidth) } : col,
  );
}

export function toggleColumnVisibility(
  columns: ColumnDef[],
  columnId: string,
): ColumnDef[] {
  return columns.map((col) =>
    col.id === columnId ? { ...col, visible: !col.visible } : col,
  );
}

export function reorderColumns(
  columns: ColumnDef[],
  fromIndex: number,
  toIndex: number,
): ColumnDef[] {
  const result = Array.from(columns);
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}
