// bake-bg-textures.mjs — generate the two background textures

// Same bake principle as bake-type.mjs: make the expensive, organic
// stuff ONCE as an image, then the shader just samples it. A painted
// blur has softer falloff than a smoothstep, and real grain has
// structure that hash() can't produce.
//
// Run once:  node bake-bg-textures.mjs
// Needs: npm install canvas
// Output: blur.png (1024²)  +  grain.png (512², tileable)
//         move both into public/assets/

import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

/* BLUR
   A soft radial glow. Built from many overlapping low-alpha circles
   at slightly jittered positions rather than one clean gradient -
   that irregularity is what stops it looking like a CSS radial.
*/
{
  const S = 1024;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  // transparent base - the shader tints this, so keep it greyscale
  ctx.clearRect(0, 0, S, S);

  const cx = S / 2;
  const cy = S / 2;

  // layer several jittered radial gradients so the falloff is organic
  const LAYERS = 26;
  for (let i = 0; i < LAYERS; i++) {
    const t = i / (LAYERS - 1);

    // radius shrinks as we layer inward, so density builds at the core
    const r = S * (0.5 - t * 0.34);

    // small offset per layer - this is the "hand-painted" irregularity
    const jx = cx + (Math.random() - 0.5) * S * 0.06;
    const jy = cy + (Math.random() - 0.5) * S * 0.06;

    const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, r);
    g.addColorStop(0, "rgba(255,255,255,0.055)");
    g.addColorStop(0.45, "rgba(255,255,255,0.028)");
    g.addColorStop(1, "rgba(255,255,255,0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // a faint wide halo so the edges don't cut off abruptly
  const halo = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 0.5);
  halo.addColorStop(0, "rgba(255,255,255,0.05)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);

  writeFileSync("./blur.png", canvas.toBuffer("image/png"));
  console.log("baked blur.png (1024x1024)");
}

/* GRAIN
   Fine monochrome noise, TILEABLE so the shader can repeat it at any
   scale without visible seams. Two octaves — coarse clumps under fine
   speckle — which is what film emulsion actually looks like
*/
{
  const S = 512;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  const img = ctx.createImageData(S, S);
  const data = img.data;

  // coarse layer: a small grid of values, smoothly interpolated, so
  // the fine speckle sits on top of gentle density variation
  const COARSE = 64;
  const coarse = new Float32Array(COARSE * COARSE);
  for (let i = 0; i < coarse.length; i++) coarse[i] = Math.random();

  const sampleCoarse = (x, y) => {
    // wrap the sample coords so the result tiles cleanly
    const fx = (x / S) * COARSE;
    const fy = (y / S) * COARSE;
    const x0 = Math.floor(fx) % COARSE;
    const y0 = Math.floor(fy) % COARSE;
    const x1 = (x0 + 1) % COARSE;
    const y1 = (y0 + 1) % COARSE;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    // smoothstep the interpolation so there are no grid artifacts
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = coarse[y0 * COARSE + x0];
    const b = coarse[y0 * COARSE + x1];
    const c = coarse[y1 * COARSE + x0];
    const d = coarse[y1 * COARSE + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const fine = Math.random();
      const soft = sampleCoarse(x, y);

      // mostly fine speckle, modulated by the coarse density
      let v = fine * 0.72 + soft * 0.28;

      // pull toward mid-grey — the shader adds/subtracts around 0.5,
      // so extreme values would blow out the background
      v = 0.5 + (v - 0.5) * 0.85;

      const px = (y * S + x) * 4;
      const g = Math.round(v * 255);
      data[px] = g;
      data[px + 1] = g;
      data[px + 2] = g;
      data[px + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  writeFileSync("./grain.png", canvas.toBuffer("image/png"));
  console.log("baked grain.png (512x512, tileable)");
}
