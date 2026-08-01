import { useLocation } from "react-router-dom";
import { useTheme } from "../ThemeProvider.jsx";
import styles from "./Nav.module.scss";

export default function Nav({ onNavigate }) {
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();

  const link = (to, label) => (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(to);
      }}
      className={`mono ${styles.link} ${pathname === to ? styles.active : ""}`}
    >
      {label}
    </a>
  );

  return (
    <header className={styles.nav}>
      <div className={`shell ${styles.inner}`}>
        <div className={styles.brand}>
          <span className={`mono ${styles.program}`}>
            <span className={styles.mark}>■</span> TEST PROGRAM 026
          </span>
          <span className="jp">テストプログラム</span>
        </div>

        <nav className={styles.links}>
          {link("/", "ARCHIVE")}
          {link("/dossier", "DOSSIER")}

          <a
            href="/day-16-reference/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className={`mono ${styles.link}`}
          >
            LAB
          </a>

          <div className={styles.toggle}>
            <button
              className={theme === "light" ? styles.on : styles.off}
              onClick={() => setTheme("light")}
              aria-pressed={theme === "light"}
            >
              LGT
            </button>
            <button
              className={theme === "dark" ? styles.on : styles.off}
              onClick={() => setTheme("dark")}
              aria-pressed={theme === "dark"}
            >
              DRK
            </button>
          </div>
        </nav>
      </div>
      <div className={styles.rule} />
    </header>
  );
}