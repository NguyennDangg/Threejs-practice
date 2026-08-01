import styles from "./LogRow.module.scss";

export default function LogRow({ log }) {
  return (
    <a
      href={log.href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.row}
    >
      {/* sector bar — F1 timing colour, absent when sector is null */}
      <span
        className={styles.sector}
        data-sector={log.sector || "none"}
        aria-hidden="true"
      />

      <span className={`mono ${styles.id}`}>{log.id}</span>
      <span className={styles.title}>{log.title}</span>
      <span className={styles.desc}>{log.desc}</span>
      <span className={`mono ${styles.tech}`}>{log.tech}</span>

      {log.sector === "purple" && (
        <span className={`mono ${styles.flag}`}>LATEST</span>
      )}
    </a>
  );
}