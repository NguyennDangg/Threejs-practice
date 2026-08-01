import { useLocation } from "react-router-dom";
import styles from "./CropMarks.module.scss";

const LABELS = {
  "/": "ARCHIVE",
  "/dossier": "DOSSIER",
};

export default function CropMarks() {
  const { pathname } = useLocation();
  const label = LABELS[pathname] || "RECORD";

  return (
    <div className={styles.marks} aria-hidden="true">
      <span className={`${styles.mark} ${styles.tl}`} />
      <span className={`${styles.mark} ${styles.tr}`} />
      <span className={`${styles.mark} ${styles.bl}`} />
      <span className={`${styles.mark} ${styles.br}`} />

      <span className={`mono ${styles.stamp} ${styles.stampL}`}>
        MK-026 / {label}
      </span>
      <span className={`mono ${styles.stamp} ${styles.stampR}`}>
        PROGRAM: 2026.06 —
      </span>
    </div>
  );
}
