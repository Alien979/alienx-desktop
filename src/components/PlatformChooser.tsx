import "./PlatformChooser.css";

interface PlatformChooserProps {
  onSelect: (platform: "windows" | "linux") => void;
}

export default function PlatformChooser({ onSelect }: PlatformChooserProps) {
  return (
    <div className="platform-chooser">
      <div className="platform-chooser-inner">
        <h1>ALIENX</h1>
        <p className="subtitle">Choose your investigation source</p>

        <div className="platform-choice-grid">
          <button
            className="platform-choice windows"
            onClick={() => onSelect("windows")}
          >
            <span className="icon">🪟</span>
            <span className="title">Windows</span>
            <span className="desc">
              EVTX/XML logs and Windows-focused detections
            </span>
          </button>

          <button
            className="platform-choice linux"
            onClick={() => onSelect("linux")}
          >
            <span className="icon">🐧</span>
            <span className="title">Linux</span>
            <span className="desc">
              Folder/ZIP evidence ingestion across auditd, syslog and journal
              exports
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
