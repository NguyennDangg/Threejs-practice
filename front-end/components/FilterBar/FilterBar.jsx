import styles from "./FilterBar.module.scss";

export default function FilterBar({ categories, counts, active, onChange }) {
  return (
    <div className={styles.bar}>
      <span className={`mono ${styles.prompt}`}>FILTER</span>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          className={`mono ${styles.btn} ${active === c.id ? styles.active : ""}`}
        >
          {c.label} · {counts[c.id]}
        </button>
      ))}
    </div>
  );
}
