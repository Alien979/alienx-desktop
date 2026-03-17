import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ParsedData, ChartDataPoint, StatusCodeData, IPData } from "../types";
import "./Dashboards.css";

interface DashboardsProps {
  data: ParsedData;
  onBack: () => void;
  onIPClick?: (ip: string) => void;
}

const COLORS = [
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#4ade80",
  "#fb923c",
  "#f87171",
  "#94a3b8",
];

export default function Dashboards({
  data,
  onBack,
  onIPClick,
}: DashboardsProps) {
  // Time series data (events per hour)
  const timeSeriesData = useMemo((): ChartDataPoint[] => {
    const counts = new Map<string, number>();

    data.entries.forEach((entry) => {
      // Skip entries with invalid timestamps
      if (!entry.timestamp || isNaN(entry.timestamp.getTime())) {
        return;
      }
      // Use the full ISO timestamp truncated to hour (YYYY-MM-DDTHH:00:00.000Z)
      const hourKey =
        entry.timestamp.toISOString().substring(0, 13) + ":00:00.000Z";
      counts.set(hourKey, (counts.get(hourKey) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([isoTime, count]) => {
        const date = new Date(isoTime);
        // Format as readable date/time
        const time = date.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return { time, count };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [data]);

  // Status code / Event ID distribution
  const statusCodeData = useMemo((): StatusCodeData[] => {
    const counts = new Map<string, number>();

    data.entries.forEach((entry) => {
      // For EVTX, use eventId; for other formats use statusCode
      let key: string;
      if (data.platform === "windows" && data.format === "evtx") {
        key = entry.eventId ? `Event ${entry.eventId}` : "Unknown";
      } else if (data.platform === "linux") {
        key =
          entry.sourceType || entry.source || entry.processName || "Unknown";
      } else {
        key = entry.statusCode?.toString() || "Unknown";
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([code, count]) => ({
        code,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 for pie chart
  }, [data]);

  // Top IPs / Computers
  const topIPsData = useMemo((): IPData[] => {
    const counts = new Map<string, number>();

    data.entries.forEach((entry) => {
      // For EVTX, use computer; for other formats use ip
      const key =
        data.platform === "windows" && data.format === "evtx"
          ? entry.computer || "Unknown"
          : entry.host || entry.ip || "Unknown";
      if (key && key !== "Unknown") {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [data]);

  // Event Frequency Anomaly Detection
  const anomalyData = useMemo(() => {
    const counts = new Map<string, number>();

    data.entries.forEach((entry) => {
      if (!entry.timestamp || isNaN(entry.timestamp.getTime())) return;
      const hourKey =
        entry.timestamp.toISOString().substring(0, 13) + ":00:00.000Z";
      counts.set(hourKey, (counts.get(hourKey) || 0) + 1);
    });

    const sorted = Array.from(counts.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    if (sorted.length < 3)
      return { data: [], mean: 0, threshold: 0, anomalies: 0 };

    const values = sorted.map(([, c]) => c);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const threshold = mean + 2 * stdDev;

    let anomalies = 0;
    const chartData = sorted.map(([isoTime, count]) => {
      const date = new Date(isoTime);
      const time = date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const isAnomaly = count > threshold;
      if (isAnomaly) anomalies++;
      return { time, count, isAnomaly, threshold: Math.round(threshold) };
    });

    return {
      data: chartData,
      mean: Math.round(mean),
      threshold: Math.round(threshold),
      anomalies,
    };
  }, [data]);

  return (
    <div className="dashboards-page">
      <div className="dashboards-header">
        <h1>Dashboards</h1>
        <button className="back-button" onClick={onBack}>
          ← Back to Main View
        </button>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>
            {data.platform === "linux"
              ? "Events Over Time"
              : data.format === "evtx"
                ? "Events Over Time"
                : "Requests Over Time"}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="time" stroke="#999" />
              <YAxis stroke="#999" />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid #444",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ fill: "#60a5fa" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>
            {data.platform === "linux"
              ? "Log Source Distribution"
              : data.format === "evtx"
                ? "Event ID Distribution"
                : "Status Code Distribution"}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusCodeData}
                dataKey="count"
                nameKey="code"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {statusCodeData.map((entry, index) => (
                  <Cell key={entry.code} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid #444",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>
            {data.platform === "linux"
              ? "Top 10 Hosts"
              : data.format === "evtx"
                ? "Top 10 Computers"
                : "Top 10 IP Addresses"}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topIPsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="ip"
                stroke="#999"
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis stroke="#999" />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid #444",
                }}
              />
              <Bar
                dataKey="count"
                fill="#a78bfa"
                onClick={(entry) => onIPClick?.(entry.ip)}
                cursor="pointer"
              />
            </BarChart>
          </ResponsiveContainer>
          {onIPClick && (
            <p className="hint">Click on a bar to filter logs by IP</p>
          )}
        </div>

        {/* Event Frequency Anomaly Detection */}
        {anomalyData.data.length > 0 && (
          <div className="chart-card" style={{ gridColumn: "1 / -1" }}>
            <h3>
              ⚡ Event Frequency Anomaly Detection
              {anomalyData.anomalies > 0 && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "#ef4444",
                    marginLeft: "0.75rem",
                  }}
                >
                  {anomalyData.anomalies} anomal
                  {anomalyData.anomalies === 1 ? "y" : "ies"} detected
                </span>
              )}
            </h3>
            <p
              style={{
                fontSize: "0.8rem",
                color: "#888",
                margin: "0 0 0.75rem",
              }}
            >
              Hourly event counts with ±2σ threshold (mean: {anomalyData.mean},
              threshold: {anomalyData.threshold}). Red bars indicate spikes
              exceeding 2 standard deviations above the mean.
            </p>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={anomalyData.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="time"
                  stroke="#999"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  fontSize={11}
                />
                <YAxis stroke="#999" />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a2e",
                    border: "1px solid #444",
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "count") return [value, "Events"];
                    return [value, name];
                  }}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <ReferenceLine
                  y={anomalyData.threshold}
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  label={{
                    value: `2σ threshold (${anomalyData.threshold})`,
                    fill: "#ef4444",
                    fontSize: 11,
                    position: "insideTopRight",
                  }}
                />
                <ReferenceLine
                  y={anomalyData.mean}
                  stroke="#60a5fa"
                  strokeDasharray="3 3"
                  label={{
                    value: `Mean (${anomalyData.mean})`,
                    fill: "#60a5fa",
                    fontSize: 11,
                    position: "insideBottomRight",
                  }}
                />
                <Bar dataKey="count" name="Events">
                  {anomalyData.data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isAnomaly ? "#ef4444" : "#60a5fa"}
                      fillOpacity={entry.isAnomaly ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {anomalyData.anomalies === 0 && (
              <p
                style={{
                  textAlign: "center",
                  color: "#4ade80",
                  fontSize: "0.85rem",
                  margin: "0.5rem 0 0",
                }}
              >
                ✓ No significant anomalies detected — event frequency is within
                normal range.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
