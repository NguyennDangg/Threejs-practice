import LogRow from "../LogRow/LogRow.jsx";
import styles from "./PhaseSection.module.scss";

export default function PhaseSection({ phase }) {
  return (
    <section className={styles.phase}>
      <div className={styles.head}>
        <span className={`mono ${styles.label}`}>
          PHASE {String(phase.id).padStart(2, "0")} — {phase.label}
        </span>
        <span className="jp">{phase.jp}</span>
        <span className={styles.rule} />
      </div>

      <div className={styles.rows}>
        {phase.logs.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
      </div>
    </section>
  );
}