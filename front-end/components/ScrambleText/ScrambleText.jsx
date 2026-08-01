import { useEffect, useRef, useState } from "react";

/* ==================================================================
   Terminal decode — cycles random katakana before settling on the
   target, resolving left to right so it reads as text LOCKING IN
   rather than flickering randomly.

   NOTE: every character in POOL must be in your Noto Sans JP subset
   (the text= param in index.html) or it renders as tofu.
================================================================== */

const POOL = "アイウエオカキクケコサシスセソタチツテトナニヌネノ".split("");

export default function ScrambleText({ text, speed = 34 }) {
  const [display, setDisplay] = useState(text);
  const timer = useRef(null);

  useEffect(() => {
    let settled = 0;
    let frame = 0;
    const LOCK_EVERY = 2; // frames each character scrambles before locking

    function tick() {
      const out = text
        .split("")
        .map((ch, i) => {
          if (i < settled) return ch;
          if (ch === " ") return " ";
          return POOL[Math.floor(Math.random() * POOL.length)];
        })
        .join("");

      setDisplay(out);
      frame++;
      if (frame % LOCK_EVERY === 0) settled++;

      if (settled <= text.length) {
        timer.current = setTimeout(tick, speed);
      } else {
        setDisplay(text);
      }
    }

    tick();
    return () => clearTimeout(timer.current);
  }, [text, speed]);

  return <>{display}</>;
}
