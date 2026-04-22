import { useState } from "react";
import {
  ColumnDef,
  toggleColumnVisibility,
  updateColumnWidth,
} from "../lib/columnConfig";
import "./ColumnConfigurator.css";

interface ColumnConfiguratorProps {
  columns: ColumnDef[];
  onColumnsChange: (columns: ColumnDef[]) => void;
  onClose: () => void;
}

export function ColumnConfigurator({
  columns,
  onColumnsChange,
  onClose,
}: ColumnConfiguratorProps) {
  const [localColumns, setLocalColumns] = useState(columns);

  const handleToggleVisibility = (columnId: string) => {
    const updated = toggleColumnVisibility(localColumns, columnId);
    setLocalColumns(updated);
  };

  const handleWidthChange = (columnId: string, newWidth: number) => {
    const updated = updateColumnWidth(localColumns, columnId, newWidth);
    setLocalColumns(updated);
  };

  const handleSave = () => {
    onColumnsChange(localColumns);
    onClose();
  };

  const visibleCount = localColumns.filter((c) => c.visible).length;

  return (
    <div className="column-configurator-overlay" onClick={onClose}>
      <div
        className="column-configurator-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="configurator-header">
          <h3>Configure Columns</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="configurator-body">
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Showing {visibleCount} of {localColumns.length} columns
          </p>

          <div className="column-list">
            {localColumns.map((col) => (
              <div key={col.id} className="column-item">
                <label className="column-checkbox">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => handleToggleVisibility(col.id)}
                  />
                  <span>{col.label}</span>
                </label>

                {col.visible && (
                  <div className="column-width-control">
                    <input
                      type="range"
                      min="50"
                      max="500"
                      step="10"
                      value={col.width}
                      onChange={(e) =>
                        handleWidthChange(col.id, Number(e.target.value))
                      }
                      className="width-slider"
                    />
                    <span className="width-display">{col.width}px</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="configurator-footer">
          <button className="action-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="action-btn primary" onClick={handleSave}>
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
