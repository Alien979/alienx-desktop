import { useState } from "react";
import { ParsedData } from "../types";
import { SigmaRuleMatch } from "../lib/sigma/types";
import {
  generateReport,
  downloadReport,
  ReportOptions,
} from "../lib/exportReport";
import { hasConversation } from "../lib/llm/storage/conversations";
import "./ExportReport.css";

interface ExportReportProps {
  data: ParsedData;
  filename: string;
  platform: string | null;
  sigmaMatches: Map<string, SigmaRuleMatch[]>;
  onClose: () => void;
}

export default function ExportReport({
  data,
  filename,
  platform,
  sigmaMatches,
  onClose,
}: ExportReportProps) {
  const [options, setOptions] = useState<ReportOptions>({
    includeExecutiveSummary: true,
    includeSigmaMatches: true,
    includeCorrelationChains: true,
    includeEventStatistics: true,
    includeIOCs: true,
    includeAIFindings: hasConversation(),
    includeTimeline: true,
    format: "html",
  });

  const [generating, setGenerating] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const handleOptionChange = (
    key: keyof ReportOptions,
    value: boolean | string,
  ) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
    setPreviewContent(null); // Clear preview when options change
  };

  const handleGenerate = () => {
    setGenerating(true);

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const content = generateReport({
          filename,
          generatedAt: new Date(),
          platform,
          data,
          sigmaMatches,
          options,
        });
        downloadReport(content, filename, options.format);
      } catch (err) {
        console.error("[Export] Report generation failed:", err);
      } finally {
        setGenerating(false);
      }
    }, 100);
  };

  const handlePreview = () => {
    setGenerating(true);

    setTimeout(() => {
      try {
        const content = generateReport({
          filename,
          generatedAt: new Date(),
          platform,
          data,
          sigmaMatches,
          options: { ...options, format: "html" },
        });
        setPreviewContent(content);
      } catch (err) {
        console.error("[Export] Preview generation failed:", err);
      } finally {
        setGenerating(false);
      }
    }, 100);
  };

  const allMatches = Array.from(sigmaMatches.values()).flat();

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h2>Export Analysis Report</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="export-body">
          {/* Report Info */}
          <div className="report-info">
            <div className="info-item">
              <span className="info-label">Events:</span>
              <span className="info-value">
                {data.entries.length.toLocaleString()}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">SIGMA Matches:</span>
              <span className="info-value">{allMatches.length}</span>
            </div>
          </div>

          {/* Format Selection */}
          <div className="format-section">
            <h3>Export Format</h3>
            <div className="format-options">
              <label
                className={`format-option ${options.format === "html" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="format"
                  value="html"
                  checked={options.format === "html"}
                  onChange={() => handleOptionChange("format", "html")}
                />
                <div className="format-icon">📄</div>
                <div className="format-details">
                  <span className="format-name">HTML Report</span>
                  <span className="format-desc">
                    Interactive, styled report viewable in browser
                  </span>
                </div>
              </label>

              <label
                className={`format-option ${options.format === "markdown" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="format"
                  value="markdown"
                  checked={options.format === "markdown"}
                  onChange={() => handleOptionChange("format", "markdown")}
                />
                <div className="format-icon">📝</div>
                <div className="format-details">
                  <span className="format-name">Markdown</span>
                  <span className="format-desc">
                    Plain text format for documentation
                  </span>
                </div>
              </label>

              <label
                className={`format-option ${options.format === "json" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={options.format === "json"}
                  onChange={() => handleOptionChange("format", "json")}
                />
                <div className="format-icon">{}</div>
                <div className="format-details">
                  <span className="format-name">JSON</span>
                  <span className="format-desc">
                    Structured data for integration
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Content Options */}
          <div className="content-section">
            <h3>Report Contents</h3>
            <div className="content-options">
              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeExecutiveSummary}
                  onChange={(e) =>
                    handleOptionChange(
                      "includeExecutiveSummary",
                      e.target.checked,
                    )
                  }
                />
                <div className="option-details">
                  <span className="option-name">Executive Summary</span>
                  <span className="option-desc">
                    Risk assessment and key findings overview
                  </span>
                </div>
              </label>

              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeSigmaMatches}
                  onChange={(e) =>
                    handleOptionChange("includeSigmaMatches", e.target.checked)
                  }
                />
                <div className="option-details">
                  <span className="option-name">SIGMA Detections</span>
                  <span className="option-desc">
                    All matched rules with severity and counts
                  </span>
                </div>
              </label>

              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeCorrelationChains}
                  onChange={(e) =>
                    handleOptionChange(
                      "includeCorrelationChains",
                      e.target.checked,
                    )
                  }
                />
                <div className="option-details">
                  <span className="option-name">Correlation Chains</span>
                  <span className="option-desc">
                    Related event sequences and attack patterns
                  </span>
                </div>
              </label>

              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeEventStatistics}
                  onChange={(e) =>
                    handleOptionChange(
                      "includeEventStatistics",
                      e.target.checked,
                    )
                  }
                />
                <div className="option-details">
                  <span className="option-name">Event Statistics</span>
                  <span className="option-desc">
                    Event ID distribution and computer breakdown
                  </span>
                </div>
              </label>

              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeTimeline}
                  onChange={(e) =>
                    handleOptionChange("includeTimeline", e.target.checked)
                  }
                />
                <div className="option-details">
                  <span className="option-name">Detection Timeline</span>
                  <span className="option-desc">
                    Chronological view of SIGMA matches
                  </span>
                </div>
              </label>

              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeIOCs}
                  onChange={(e) =>
                    handleOptionChange("includeIOCs", e.target.checked)
                  }
                />
                <div className="option-details">
                  <span className="option-name">IOC Indicators</span>
                  <span className="option-desc">
                    Extracted IPs, domains, hashes, and URLs
                  </span>
                </div>
              </label>

              <label className="content-option">
                <input
                  type="checkbox"
                  checked={options.includeAIFindings}
                  onChange={(e) =>
                    handleOptionChange("includeAIFindings", e.target.checked)
                  }
                  disabled={!hasConversation()}
                />
                <div className="option-details">
                  <span className="option-name">AI Analysis Findings</span>
                  <span className="option-desc">
                    {hasConversation()
                      ? "LLM conversation log and insights"
                      : "No AI conversation in this session"}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Preview Section */}
          {previewContent && (
            <div className="preview-section">
              <h3>Preview</h3>
              <div className="preview-frame">
                <iframe
                  srcDoc={previewContent}
                  title="Report Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}
        </div>

        <div className="export-footer">
          <button
            className="preview-btn"
            onClick={handlePreview}
            disabled={generating}
          >
            {generating ? "Generating..." : "👁️ Preview"}
          </button>
          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating
              ? "Generating..."
              : `📥 Download ${options.format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
