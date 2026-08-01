import { useEffect, useRef } from "react";
import styles from "./ScatterOverlay.module.scss";

/*
   Dither scatter overlay - the Day 18 effect on canvas 2D.
   Every cell gets a random threshold; a progress value sweeps past
   them so blocks flip in scattered order rather than fading uniformly.

     mode="boot"       - starts covered, reveals once
     mode="transition" - cover, fire onCovered (swap route), reveal
*/

const CELL = 12;
const COVER_MS = 480;
const REVEAL_MS = 620;

export default function ScatterOverlay({
  mode,
  onCovered,
  onDone,
  colorVar = "--bg",
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  /* Callbacks live in a ref, not in the dependency array. Parent
     re-renders create new function identities; if the effect depended
     on them it would restart the animation mid-flight and loop. */
  const cbRef = useRef({ onCovered, onDone });
  cbRef.current = { onCovered, onDone };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let w, h, cols, rows, thresholds;

    function build() {
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);

      // one random threshold per cell - this is the dither
      thresholds = new Float32Array(cols * rows);
      for (let i = 0; i < thresholds.length; i++) thresholds[i] = Math.random();
    }

    build();
    window.addEventListener("resize", build);

    const fill = getComputedStyle(document.documentElement)
      .getPropertyValue(colorVar)
      .trim();

    function draw(progress) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = fill;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (thresholds[y * cols + x] < progress) {
            ctx.fillRect(x * CELL, y * CELL, CELL + 1, CELL + 1);
          }
        }
      }
    }

    const ease = (t) => t * t * (3 - 2 * t);

    function animate(from, to, ms) {
      return new Promise((resolve) => {
        const start = performance.now();
        function step(now) {
          const raw = Math.min((now - start) / ms, 1);
          draw(from + (to - from) * ease(raw));
          if (raw < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            resolve();
          }
        }
        rafRef.current = requestAnimationFrame(step);
      });
    }

    let cancelled = false;

    async function run() {
      if (mode === "boot") {
        draw(1);
        await new Promise((r) => setTimeout(r, 220));
        if (cancelled) return;
        await animate(1, 0, REVEAL_MS);
      } else {
        draw(0);
        await animate(0, 1, COVER_MS);
        if (cancelled) return;
        cbRef.current.onCovered?.(); // swap the route while hidden
        await new Promise((r) => setTimeout(r, 90));
        if (cancelled) return;
        await animate(1, 0, REVEAL_MS);
      }
      if (!cancelled) cbRef.current.onDone?.();
    }

    run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", build);
    };
  }, [mode, colorVar]); // callbacks deliberately excluded

  return <canvas ref={canvasRef} className={styles.overlay} />;
}
