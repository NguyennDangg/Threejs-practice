import { useEffect, useState } from "react";
import styles from "./Telemetry.module.scss";

/* Module scope - evaluated ONCE when this file is first imported and
   never again for the life of the page. That's what makes ELAPSED
   survive route changes: the component unmounts and remounts, but
   this constant doesn't care. A hard refresh does reset it, which is
   correct - that genuinely is a new session */
const SESSION_START = Date.now();

const pad = (n) => String(n).padStart(2, "0");

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function Telemetry({ runs, sessions }) {
  // seed from SESSION_START so returning to this route shows the
  // correct time immediately, not 00:00:00 for a beat
  const [uptime, setUptime] = useState(() =>
    formatUptime(Date.now() - SESSION_START),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setUptime(formatUptime(Date.now() - SESSION_START));
    }, 1000);
    return () => clearInterval(id); // no orphan intervals on unmount
  }, []);

  return (
    <div className={styles.strip}>
      <Cell label="RUNS" value={runs} />
      <Cell label="SESSIONS" value={sessions} />
      <Cell label="ELAPSED" value={uptime} />
      <Cell label="STATUS" value="NOMINAL" tone="green" />
    </div>
  );
}

function Cell({ label, value, tone }) {
  return (
    <div className={styles.cell}>
      <span className={`mono ${styles.label}`}>{label}</span>
      <span className={`mono ${styles.value} ${tone ? styles[tone] : ""}`}>
        {value}
      </span>
    </div>
  );
}
