import { createCanvas } from "canvas";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// CONFIG
const OUT_DIR = "./public/assets";

// Seeded, not Math.random(). The blur's jitter and mass placement ARE the
// composition — an unseeded bake reshuffles them every run and silently
// invalidates whatever you tuned against the last one. Change SEED
// deliberately, never accidentally
const SEED = 20260806;

const BLUR = {
  size: 1024,

  // Ambient alpha across the whole texture. This is the setting that lets
  // the glow read as SEPARATE from the pattern: with a zero floor the
  // marbling only exists inside the blob, so the mask and the pattern are
  // the same object moving together. With a floor, the pattern lives
  // everywhere and the glow is a brightening that passes over it.
  // It also means ClampToEdge extends a uniform value instead of zero,
  // which is why the shader needs no in-bounds guard.
  // 0.06 = moodier, 0.16 = flatter. This changes the piece more than any
  // single number in the shader.
  floor: 0.1,

  // Several asymmetric masses, not one centred blob. A painted composition
  // covers most of the frame and is weighted off-centre; a single symmetric
  // radial can't get there no matter how it's scaled in-shader.
  // x/y/r are fractions of size; weight scales that mass's density.
  masses: [
    { x: 0.62, y: 0.44, r: 0.62, weight: 1.0 },
    { x: 0.34, y: 0.7, r: 0.4, weight: 0.55 },
    { x: 0.74, y: 0.22, r: 0.3, weight: 0.4 },
  ],
  layersPerMass: 18,
  coreAlpha: 0.05, // per-layer centre alpha — these composite, see NORMALISE
  jitter: 0.05, // per-layer offset, the "hand-painted" irregularity
};

const GRAIN = {
  size: 512,
  coarseGrid: 64, // the octave a hash() can't reproduce
  fineMix: 0.72, // mostly fine speckle, modulated by coarse density
  contrast: 0.85, // pull toward mid-grey (day-22 centres on 0.5)
};

// mulberry32 — small, fast, good enough for texture jitter
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* BLUR
   An alpha-only mask. Many overlapping low-alpha circles at jittered
   positions rather than clean gradients — that irregularity is what stops
   it reading as a CSS radial.

   The composition lives HERE, in the image, not in the shader. That's the
   lesson from reading the reference: his shader samples the blur at 1:1
   with raw uv, so the asymmetry has to be painted in. Our shader adds a
   travelling remap on top, which is a divergence, but the underlying image
   still has to carry a composition worth moving.
*/
function bakeBlur(rand) {
  const S = BLUR.size;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, S, S);

  for (const mass of BLUR.masses) {
    for (let i = 0; i < BLUR.layersPerMass; i++) {
      const t = i / (BLUR.layersPerMass - 1);
      // radius shrinks per layer, so density builds toward each core
      const r = S * mass.r * (1.0 - t * 0.62);

      const jx = S * mass.x + (rand() - 0.5) * S * BLUR.jitter;
      const jy = S * mass.y + (rand() - 0.5) * S * BLUR.jitter;

      const a = BLUR.coreAlpha * mass.weight;
      const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.45, `rgba(255,255,255,${a * 0.5})`);
      g.addColorStop(1, "rgba(255,255,255,0)");

      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
  }

  // NORMALISE, then lift onto the floor.
  // Source-over compositing is 1-(1-a)^n, not n*a — layers land well short
  // of 1.0. In 22c blurAlpha is ALSO the canvas alpha, so an un-normalised
  // bake caps the whole composite's opacity and no shader tuning gets it
  // back. Normalise to 1.0 first, then remap 0..1 onto floor..1.
  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;

  let peak = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > peak) peak = data[i];
  const gain = peak > 0 ? 1 / peak : 0;

  let edgeMin = 255;
  let sum = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = (y * S + x) * 4;
      // RGB white everywhere, so anything sampling .rgb gets neutral
      data[px] = data[px + 1] = data[px + 2] = 255;

      const norm = data[px + 3] * gain;
      const out = Math.round((BLUR.floor + (1 - BLUR.floor) * norm) * 255);
      data[px + 3] = out;
      sum += out;

      if (x === 0 || y === 0 || x === S - 1 || y === S - 1) {
        edgeMin = Math.min(edgeMin, out);
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    buffer: canvas.toBuffer("image/png"),
    peakBefore: peak / 255,
    floor: BLUR.floor,
    edgeMin,
    mean: sum / (S * S) / 255,
  };
}

/* GRAIN
   Fine greyscale noise, TILEABLE so the shader repeats it at any scale
   without seams. Two octaves — coarse density clumps under fine speckle —
   which is what emulsion actually looks like, and specifically the part
   procedural noise is bad at.

   Greyscale on purpose. The reference reads R as warp magnitude and G as
   warp angle, which only works if the channels are independent — a
   greyscale bake makes them identical, and his own texture measures
   corr(R,G) = 0.877, so it barely worked there either. Rather than bake two
   uncorrelated octave sets (double the file, for a field that's
   high-frequency either way), magnitude comes from here and the angle comes
   from a hash() in the shader. Right tool per half.
*/
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
      // day-22 does `texture.r - 0.5`, so the mean has to sit at 0.5 or the
      // whole frame picks up a DC brightness shift
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
// The old failure was invisible: files existed, the shader ran, the output
// was wrong. Print enough to tell at a glance whether the bake is usable,
// instead of finding out three variants later.
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const ok = (cond) => (cond ? "ok  " : "WARN");

console.log(`\nseed ${SEED} → ${OUT_DIR}\n`);

console.log(
  `blur.png   ${BLUR.size}²  RGBA, alpha-carrying, ${BLUR.masses.length} masses`,
);
console.log(
  `  ok   peak ${pct(blur.peakBefore)} → 100%, lifted onto a ${pct(blur.floor)} floor`,
);
console.log(
  `  ok   mean alpha ${pct(blur.mean)} — this is roughly how much of the frame is lit`,
);
console.log(
  `  ${ok(blur.edgeMin > 0)} edge alpha ${blur.edgeMin}/255 — ClampToEdge extends the floor, not zero,`,
);
console.log(`       which is why the shader needs no in-bounds guard`);

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
console.log(`  • grain is ${GRAIN.size}², NOT 1024 — the reference's`);
console.log(
  `    mod(..., 1024.0)/1024.0 is wrong here. RepeatWrapping tiles it:`,
);
console.log(`      vUv * uRes * uGrainScale / uGrainSize`);
console.log(`  • both are DATA, not colour — leave colorSpace at its default`);
console.log(`    (NoColorSpace). Tagging SRGBColorSpace re-curves the values.`);
console.log(
  `  • warp angle comes from hash() in the shader, not from grain.g\n`,
);
