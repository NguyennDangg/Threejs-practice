// bake-type.mjs — generate a baked typography image (the "static layer")

// This is the BAKE step: draw expensive-to-arrange type ONCE to a
// canvas, export it as a PNG. Day 17's shader then loads this single
// image and animates a thin live layer (fluid) on top - the same
// "bake static, animate cheap" model Yuta uses with his .webp files

// Run once: node bake-type.mjs
// Needs: npm install canvas
// Output: ./type-signal-lost.png  (move into your public/assets/)

import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

const W = 2048;
const H = 2048;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// background: near-black, faint vignette so it's not dead flat
ctx.fillStyle = "#0a0a0a";
ctx.fillRect(0, 0, W, H);

// a scattered field of the words, low-contrast, like Yuta's poster
// these sit UNDER the hero type as texture, dim and rotated
ctx.save();
ctx.fillStyle = "#1a1a1a"; // barely above the bg - ghost layer
ctx.textAlign = "center";
ctx.textBaseline = "middle";
const ghostWords = ["SIGNAL", "LOST", "NO CARRIER", "SIGNAL", "LOST"];
for (let i = 0; i < 18; i++) {
  const gx = Math.random() * W;
  const gy = Math.random() * H;
  const gsize = 40 + Math.random() * 90;
  const word = ghostWords[i % ghostWords.length];
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate((Math.random() - 0.5) * 0.5);
  ctx.font = `700 ${gsize}px "Space Mono", monospace`;
  ctx.fillText(word, 0, 0);
  ctx.restore();
}
ctx.restore();

// hero type: big, bold, high-contrast, two stacked words
ctx.textAlign = "center";
ctx.textBaseline = "middle";

// SIGNAL — bright
ctx.fillStyle = "#f4f1ea";
ctx.font = `700 340px "DejaVu Sans Mono", monospace`;
ctx.fillText("SIGNAL", W / 2, H / 2 - 190);

// LOST — NERV red, the accent
ctx.fillStyle = "#c1121f";
ctx.font = `700 340px "DejaVu Sans Mono", monospace`;
ctx.fillText("LOST", W / 2, H / 2 + 190);

// a thin technical readout line, small caps, terminal flavor
ctx.fillStyle = "#8c887e";
ctx.font = `400 44px "DejaVu Sans Mono", monospace`;
ctx.fillText("// CARRIER DROPPED — RETRYING", W / 2, H / 2 + 460);
ctx.fillText("MK-026 · NERV", W / 2, H / 2 - 470);

// export
const buffer = canvas.toBuffer("image/png");
writeFileSync("./type-signal-lost.png", buffer);
console.log("baked type-signal-lost.png (" + W + "x" + H + ")");
