import { useMemo, useState } from "react";
import {
  CATEGORIES,
  categoryCounts,
  logsByPhase,
  LOGS,
  sessionCount,
} from "../../data/logs.js";
import Telemetry from "../../components/Telemetry/Telemetry.jsx";
import FilterBar from "../../components/FilterBar/FilterBar.jsx";
import PhaseSection from "../../components/PhaseSection/PhaseSection.jsx";
import styles from "./Archive.module.scss";
import ScenarioLine from "../../components/ScenarioLine/ScenarioLine.jsx";
import Clock from "../../components/Clock/Clock.jsx";

export default function Archive() {
  const [category, setCategory] = useState("all");

  // recompute grouped logs only when the filter changes
  const phases = useMemo(() => logsByPhase(category), [category]);
  const visible = useMemo(
    () => phases.reduce((n, p) => n + p.logs.length, 0),
    [phases],
  );

  return (
    <div>
      <header className={styles.header}>
        <p className={`mono ${styles.eyebrow}`}>
          RUN LOG · SESSION 01–{String(sessionCount).padStart(2, "0")}
        </p>
        <h1 className={styles.title}>THREE.JS JOURNEY</h1>
        <p className={`jp ${styles.sub}`}>
          実験記録 · WEBGL DEVELOPMENT PROGRAM
        </p>
      </header>

      <Telemetry runs={LOGS.length} sessions={sessionCount} />

      <FilterBar
        categories={CATEGORIES}
        counts={categoryCounts}
        active={category}
        onChange={setCategory}
      />

      {phases.map((phase) => (
        <PhaseSection key={phase.id} phase={phase} />
      ))}

      {visible === 0 && (
        <p className={`mono ${styles.empty}`}>NO RECORDS MATCH QUERY</p>
      )}

      <footer className={styles.footer}>
        <span className="mono">
          TELEMETRY: LIVE &nbsp;//&nbsp; CONNECTION: STABLE &nbsp;//&nbsp;
          TOKYO-3 &nbsp;//&nbsp; <Clock />
        </span>
        <ScenarioLine />
      </footer>
    </div>
  );
}
