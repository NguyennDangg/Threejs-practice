import { createCanvas } from "canvas";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// CONFIG
const OUT_DIR = "./public/assets";

const SEED = 20260806;

const BLUR = {
  size: 1024,
  layers: 26,
  coreAlpha: 0.055, // per-layer centre alpha — they composite, see below
  midAlpha: 0.028, // alpha at the 45% stop
  radiusStart: 0.5, // as a fraction of size
  radiusShrink: 0.34, // radius shrinks per layer → density builds at core
  jitter: 0.06, // per-layer offset — the "hand-painted" irregularity
  haloAlpha: 0.05, // faint wide halo so edges don't cut off abruptly
};

const GRAIN = {
  size: 512,
  coarseGrid: 64, // the octave a hash() can't reproduce
  fineMix: 0.72, // mostly fine speckle, modulated by coarse density
  contrast: 0.85, // pull toward mid-grey (day-22 centres on 0.5)
};

// mulberry32 - small, fast, good enough for texture jitter
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// BLUR
function bakeBlur(rand) {
  const S = BLUR.size;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, S, S);

  const cx = S / 2;
  const cy = S / 2;

  for (let i = 0; i < BLUR.layers; i++) {
    const t = i / (BLUR.layers - 1);
    const r = S * (BLUR.radiusStart - t * BLUR.radiusShrink);

    const jx = cx + (rand() - 0.5) * S * BLUR.jitter;
    const jy = cy + (rand() - 0.5) * S * BLUR.jitter;

    const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, r);
    g.addColorStop(0, `rgba(255,255,255,${BLUR.coreAlpha})`);
    g.addColorStop(0.45, `rgba(255,255,255,${BLUR.midAlpha})`);
    g.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  const halo = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 0.5);
  halo.addColorStop(0, `rgba(255,255,255,${BLUR.haloAlpha})`);
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);

  // NORMALISE
  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;

  let peak = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > peak) peak = data[i];
  const gain = peak > 0 ? 255 / peak : 1;

  let edgeMax = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = (y * S + x) * 4;
      // RGB white everywhere so anything sampling .rgb gets neutral
      data[px] = data[px + 1] = data[px + 2] = 255;
      data[px + 3] = Math.min(255, Math.round(data[px + 3] * gain));

      const onEdge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      if (onEdge && data[px + 3] > edgeMax) edgeMax = data[px + 3];
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    buffer: canvas.toBuffer("image/png"),
    peakBefore: peak / 255,
    gain,
    edgeMax,
  };
}

// GRAIN
function bakeGrain(rand) {
  const S = GRAIN.size;
  const N = GRAIN.coarseGrid;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  const img = ctx.createImageData(S, S);
  const data = img.data;

  const coarse = new Float32Array(N * N);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rand();

  // wraps on both axes, so the coarse octave tiles as cleanly as the fine one
  const sampleCoarse = (x, y) => {
    const fx = (x / S) * N;
    const fy = (y / S) * N;
    const x0 = Math.floor(fx) % N;
    const y0 = Math.floor(fy) % N;
    const x1 = (x0 + 1) % N;
    const y1 = (y0 + 1) % N;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx); // smoothstep, else grid artifacts
    const sy = ty * ty * (3 - 2 * ty);
    const a = coarse[y0 * N + x0];
    const b = coarse[y0 * N + x1];
    const c = coarse[y1 * N + x0];
    const d = coarse[y1 * N + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };

  let sum = 0;
  let sumSq = 0;
  let min = 255;
  let max = 0;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fine = rand();
      const soft = sampleCoarse(x, y);

      let v = fine * GRAIN.fineMix + soft * (1 - GRAIN.fineMix);
      // day-22 does `texture.r - 0.5`, so the mean has to sit at 0.5 or
      // the whole frame picks up a DC brightness shift
      v = 0.5 + (v - 0.5) * GRAIN.contrast;

      const g = Math.round(v * 255);
      const px = (y * S + x) * 4;
      data[px] = data[px + 1] = data[px + 2] = g;
      data[px + 3] = 255;

      sum += g;
      sumSq += g * g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
  }

  ctx.putImageData(img, 0, 0);

  const n = S * S;
  const mean = sum / n;
  return {
    buffer: canvas.toBuffer("image/png"),
    mean: mean / 255,
    std: Math.sqrt(sumSq / n - mean * mean) / 255,
    min: min / 255,
    max: max / 255,
  };
}

// RUN
mkdirSync(OUT_DIR, { recursive: true });

const rand = mulberry32(SEED);
const blur = bakeBlur(rand);
const grain = bakeGrain(rand);

writeFileSync(join(OUT_DIR, "blur.png"), blur.buffer);
writeFileSync(join(OUT_DIR, "grain.png"), grain.buffer);

// VERIFY
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const ok = (cond) => (cond ? "ok  " : "WARN");

console.log(`\nseed ${SEED} → ${OUT_DIR}\n`);

console.log(`blur.png   ${BLUR.size}²  RGBA, alpha-carrying`);
console.log(
  `  ${ok(true)} peak alpha ${pct(blur.peakBefore)} → 100% (gain ${blur.gain.toFixed(2)}×)`,
);
console.log(
  `  ${ok(blur.edgeMax === 0)} edge alpha ${blur.edgeMax}/255 — falloff reaches zero inside the texture,`,
);
console.log(
  `       so the shader's in-bounds guard is redundant; ClampToEdge is enough`,
);

console.log(
  `\ngrain.png  ${GRAIN.size}²  greyscale, tileable, ${GRAIN.coarseGrid}² coarse octave`,
);
console.log(
  `  ${ok(Math.abs(grain.mean - 0.5) < 0.01)} mean ${grain.mean.toFixed(4)} (want ~0.5000 — day-22 centres on it)`,
);
console.log(
  `  ok   std ${grain.std.toFixed(4)}  range ${grain.min.toFixed(3)}–${grain.max.toFixed(3)}`,
);

console.log(`\nshader-side, so these stay in sync:`);
console.log(
  `  • grain is ${GRAIN.size}², NOT 1024 — the mod(..., 1024.0)/1024.0 in 22a/b/c`,
);
console.log(
  `    is wrong for this bake. With RepeatWrapping set, drop the mod entirely:`,
);
console.log(`      gl_FragCoord.xy * uGrainTile / uGrainSize`);
console.log(
  `  • grain is DATA, not colour — leave grainTex.colorSpace at its default`,
);
console.log(
  `    (NoColorSpace). Tagging it SRGBColorSpace re-curves the values.`,
);
console.log(
  `  • warp angle comes from hash() in the shader, not from grain.g\n`,
);
