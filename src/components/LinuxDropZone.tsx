import { useCallback, useMemo, useState } from "react";
import JSZip from "jszip";
import { ParsedData } from "../types";
import { parseFilesForPlatform, ParserInputFile } from "../parsers";
import { isZipFile } from "../lib/zipUtils";
import {
  collectFilesFromDataTransfer,
  CollectedFile,
} from "../lib/fileTreeUtils";
import "./LinuxDropZone.css";

interface LinuxDropZoneProps {
  onFileLoaded: (data: ParsedData, filename: string) => void;
  rulesLoading?: boolean;
  onOpenSessions?: () => void;
}

const TEXT_EXTENSIONS = [
  ".log",
  ".txt",
  ".json",
  ".jsonl",
  ".ndjson",
  ".audit",
  ".out",
];

const BLOCKED_EXTENSIONS = [
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".pdf",
  ".mp4",
  ".mp3",
  ".bin",
  ".iso",
  ".7z",
  ".rar",
  ".tar",
  ".gz",
  ".xz",
];

const NAME_HINTS = [
  "auth.log",
  "secure",
  "messages",
  "syslog",
  "kern.log",
  "audit.log",
  "journal",
];

function isBlockedBinaryName(name: string): boolean {
  const lower = name.toLowerCase();
  return BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isSupportedLinuxName(name: string): boolean {
  const lower = name.toLowerCase();
  if (isBlockedBinaryName(lower)) return false;

  const baseName = lower.split(/[\\/]/).pop() || lower;
  const hasDot = baseName.includes(".");

  return (
    TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
    NAME_HINTS.some((hint) => lower.includes(hint)) ||
    !hasDot
  );
}

async function extractZipForLinux(file: File): Promise<ParserInputFile[]> {
  const zip = await JSZip.loadAsync(file);
  const output: ParserInputFile[] = [];
  const MAX_NESTED_ZIP_DEPTH = 2;

  async function extractNested(
    archive: JSZip,
    archivePath: string,
    depth: number,
  ): Promise<void> {
    for (const [relativePath, entry] of Object.entries(archive.files)) {
      if (entry.dir) continue;

      const virtualPath = `${archivePath}/${relativePath}`;
      const lowerPath = relativePath.toLowerCase();

      // Recurse into nested ZIPs (common in exported evidence bundles).
      if (lowerPath.endsWith(".zip") && depth < MAX_NESTED_ZIP_DEPTH) {
        try {
          const nestedBuffer = await entry.async("arraybuffer");
          const nestedZip = await JSZip.loadAsync(nestedBuffer);
          const nestedName = relativePath.split("/").pop() || relativePath;
          await extractNested(
            nestedZip,
            `${archivePath}/${nestedName}`,
            depth + 1,
          );
          continue;
        } catch {
          // If a nested file looks like zip but fails to parse, continue with normal filtering.
        }
      }

      if (!isSupportedLinuxName(relativePath)) continue;

      const blob = await entry.async("blob");
      const extracted = new File(
        [blob],
        relativePath.split("/").pop() || relativePath,
        {
          type: "text/plain",
        },
      );

      output.push({
        file: extracted,
        sourcePath: virtualPath,
      });
    }
  }

  await extractNested(zip, file.name, 0);

  return output;
}

export default function LinuxDropZone({
  onFileLoaded,
  rulesLoading,
  onOpenSessions,
}: LinuxDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState<{
    total: number;
    parsed: number;
    skipped: number;
    errors: number;
  } | null>(null);

  const disabled = useMemo(
    () => Boolean(rulesLoading || isProcessing),
    [rulesLoading, isProcessing],
  );

  const processFiles = useCallback(
    async (incoming: CollectedFile[]) => {
      if (!incoming.length) return;
      setIsProcessing(true);
      setSummary(null);
      setStatus("Discovering Linux evidence files...");

      try {
        const queue: ParserInputFile[] = [];
        for (let i = 0; i < incoming.length; i++) {
          const item = incoming[i];
          const file = item.file;
          const relative =
            item.relativePath || file.webkitRelativePath || file.name;
          const isZip = await isZipFile(file);

          if (isZip) {
            setStatus(`Extracting ZIP: ${file.name}`);
            const extracted = await extractZipForLinux(file);
            queue.push(...extracted);
            continue;
          }

          if (!isSupportedLinuxName(relative)) {
            continue;
          }

          queue.push({ file, sourcePath: relative });
        }

        if (queue.length === 0) {
          setSummary({
            total: incoming.length,
            parsed: 0,
            skipped: incoming.length,
            errors: 0,
          });
          setStatus("No supported Linux log files found.");
          setIsProcessing(false);
          return;
        }

        const parsed = await parseFilesForPlatform(
          queue,
          "linux",
          (processed, total) => {
            setStatus(`Parsing Linux logs... ${processed}/${total}`);
          },
        );

        setSummary({
          total: queue.length,
          parsed: parsed.parserResult.parsedFiles.length,
          skipped: parsed.parserResult.skippedFiles.length,
          errors: parsed.parserResult.errors.length,
        });

        if (parsed.entries.length > 0) {
          onFileLoaded(parsed, `linux_evidence_${new Date().toISOString()}`);
          setStatus("Linux ingestion complete.");
        } else {
          setStatus(
            "No parseable Linux events were found in the selected evidence.",
          );
        }
      } catch (error) {
        setStatus(
          `Linux ingestion failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [onFileLoaded],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const dropped = await collectFilesFromDataTransfer(e.dataTransfer);
      void processFiles(dropped);
    },
    [disabled, processFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || disabled) return;

      const selected: CollectedFile[] = Array.from(files).map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
      }));

      void processFiles(selected);
      e.currentTarget.value = "";
    },
    [disabled, processFiles],
  );

  return (
    <div className={`linux-drop-zone ${disabled ? "disabled" : ""}`}>
      <div
        className={`linux-drop-content ${isDragging ? "dragging" : ""}`}
        onDrop={disabled ? undefined : handleDrop}
        onDragOver={
          disabled
            ? undefined
            : (e) => {
                e.preventDefault();
                setIsDragging(true);
              }
        }
        onDragLeave={
          disabled
            ? undefined
            : (e) => {
                e.preventDefault();
                setIsDragging(false);
              }
        }
      >
        <div className="icon">🐧</div>
        <h2>Drop Linux evidence files/folders/ZIP here</h2>
        <p>
          Supported inputs include journal JSON exports, auditd logs, and
          syslog/auth logs.
        </p>

        <div className="linux-buttons">
          <label className="file-input-label">
            <input
              type="file"
              multiple
              onChange={handleFileInput}
              style={{ display: "none" }}
              disabled={disabled}
              accept=".log,.txt,.json,.jsonl,.ndjson,.zip"
            />
            <span className="button">Upload Files</span>
          </label>

          <label className="file-input-label">
            <input
              type="file"
              multiple
              onChange={handleFileInput}
              style={{ display: "none" }}
              disabled={disabled}
              {...({ webkitdirectory: "", directory: "" } as any)}
            />
            <span className="button">Upload Folder</span>
          </label>

          {onOpenSessions && (
            <button
              className="sessions-button"
              onClick={onOpenSessions}
              disabled={disabled}
            >
              💾 Load saved session
            </button>
          )}
        </div>

        {status && <div className="linux-status">{status}</div>}

        {summary && (
          <div className="linux-summary">
            <span>Total considered: {summary.total}</span>
            <span>Parsed: {summary.parsed}</span>
            <span>Skipped: {summary.skipped}</span>
            <span>Errors: {summary.errors}</span>
          </div>
        )}
      </div>
    </div>
  );
}
