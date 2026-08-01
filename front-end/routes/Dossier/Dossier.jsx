import { useState } from "react";
import Clock from "../../components/Clock/Clock.jsx";
import ScrambleText from "../../components/ScrambleText/ScrambleText.jsx";
import { LOGS, sessionCount } from "../../data/logs.js";
import styles from "./Dossier.module.scss";

const LINKS = [
  {
    name: "PORTFOLIO",
    jp: "作品集",
    meta: "maiky.dev",
    href: "https://maiky.dev",
  },
  {
    name: "GITHUB",
    jp: "記録保管",
    meta: "@NguyennDangg",
    href: "https://github.com/NguyennDangg",
  },
  {
    name: "SOUNDCLOUD",
    jp: "音声保管",
    meta: "cold storage",
    href: "https://soundcloud.com/ng-uwu",
  },
];

export default function Dossier() {
  return (
    <div>
      <section className={styles.cover}>
        <div className={styles.classBar}>
          <span className={`mono ${styles.classText}`}>極秘 · RESTRICTED</span>
          <span className={`mono ${styles.classText}`}>DIST: PUBLIC</span>
        </div>

        <div className={styles.coverBody}>
          <div className={styles.docNumber}>
            <span className={`mono ${styles.docLabel}`}>DOCUMENT</span>
            <span className={styles.docValue}>026</span>
          </div>

          <dl className={styles.fields}>
            <Field label="TITLE" value="TEST PROGRAM — WEBGL" />
            <Field
              label="CONTENTS"
              value={`${LOGS.length} ENTRIES / ${sessionCount} SESSIONS`}
            />
            <Field label="OPENED" value="2026.06" />
            <Field label="CLASSIFICATION" value="DEVELOPMENT" tone="green" />
            <Field label="ORIGIN" value="HO CHI MINH CITY, VN" />
          </dl>
        </div>

        <div className={styles.stamp} aria-hidden="true">
          <span>ACTIVE</span>
          <span className={styles.stampSub}>2026.06</span>
        </div>
      </section>

      <Block label="PROGRAM" jp="計画">
        <p>A learning journal. Nothing is finished here. WebGL, GLSL, and real-time graphics.</p>
        <p>
          Objective: understand the systems rather than the abstractions built
          on top of them. Each entry isolates one concept and goes no further.
        </p>
      </Block>

      <Block label="METHOD" jp="方法">
        <p>
          Techniques were studied from published work, then reconstructed from
          principle. No source was extracted.
        </p>
        <p>Slower. It is the only method that holds.</p>
      </Block>

      <Block label="TRANSMISSION" jp="送信">
        <ul className={styles.links}>
          {LINKS.map((l) => (
            <LinkRow key={l.name} link={l} />
          ))}
        </ul>
      </Block>

      <Block label="REFERENCE" jp="参照">
        <p className={styles.credits}>
          Keita Yamada <span className={styles.sep}>·</span> Yuta Abe
          <span className={styles.sep}>·</span> Bruno Simon
        </p>
      </Block>

      <section className={styles.signature}>
        <span className={`mono ${styles.sigLabel}`}>PREPARED BY</span>
        <span className={styles.sigName}>NGUYEN HAI DANG</span>
        <span className={`mono ${styles.sigRole}`}>
          FRONTEND DEVELOPER · MK-026
        </span>
      </section>

      <footer className={styles.footer}>
        <span className="mono">
          END OF FILE &nbsp;//&nbsp; 026 &nbsp;//&nbsp; <Clock />
        </span>
        <p className={`mono ${styles.margin}`}>
          None of this was necessary. It was worth it anyway.
        </p>
      </footer>
    </div>
  );
}

function LinkRow({ link }) {
  const [hover, setHover] = useState(false);

  return (
    <li
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <a href={link.href} target="_blank" rel="noopener noreferrer">
        <span className={styles.linkName}>
          {hover ? <ScrambleText key="jp" text={link.jp} /> : link.name}
        </span>
        <span className={`mono ${styles.linkMeta}`}>{link.meta}</span>
      </a>
    </li>
  );
}

function Field({ label, value, tone }) {
  return (
    <div className={styles.field}>
      <dt className={`mono ${styles.fieldLabel}`}>{label}</dt>
      <dd className={`mono ${styles.fieldValue} ${tone ? styles[tone] : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Block({ label, jp, children }) {
  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <span className={`mono ${styles.blockLabel}`}>{label}</span>
        <span className="jp">{jp}</span>
        <span className={styles.rule} />
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}