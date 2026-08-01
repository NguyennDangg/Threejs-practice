import { useEffect, useRef, useState } from "react";
import styles from "./ScenarioLine.module.scss";

const LINES = [
  "scenario complete. feelings irrelevant.",
  "magi system synchronized. awaiting input.",
  "pattern blue. no anomalies detected.",
  "sync ratio nominal. proceed at will.",
];

export default function ScenarioLine() {
  const [text, setText] = useState("");
  const timers = useRef([]);

  useEffect(() => {
    let index = 0;
    let cancelled = false;

    const wait = (ms) =>
      new Promise((res) => {
        const id = setTimeout(res, ms);
        timers.current.push(id);
      });

    async function run() {
      while (!cancelled) {
        const line = LINES[index % LINES.length];

        // type in
        for (let i = 1; i <= line.length && !cancelled; i++) {
          setText(line.slice(0, i));
          await wait(38);
        }
        await wait(2600);

        // erase
        for (let i = line.length; i >= 0 && !cancelled; i--) {
          setText(line.slice(0, i));
          await wait(16);
        }
        await wait(500);

        index++;
      }
    }
    run();

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <p className={`mono ${styles.line}`}>
      {text}
      <span className={styles.cursor}>_</span>
    </p>
  );
}
