// day-22c — capstone: anchored wave background, NERV / SEELE

// The day-22 arc lands here. Everything the four files worked out, and
// nothing that isn't load-bearing:

//   from day-22   the bake-once principle, and the blur+grain pairing
//   from 22a      domain warp, grain as a polar warp offset, the
//                 magnitude-from-bake / angle-from-hash split
//   from 22b      the anchored off-frame composition and the wave drift

// THE GLOW AND THE PATTERN ARE TWO OBJECTS.
// An earlier draft had them moving as one piece, for three reasons worth
// naming since they're easy to reintroduce:
//   1. the pattern sampled at fixed vUv, so it had no travel of its own —
//      only the mask moved, and the eye read that as one thing sliding
//   2. gr and freq both took the full (1 - blurAlpha) coupling, so the mask
//      actively dragged the warp field along with it
//   3. the bake's alpha fell to zero, so the marbling only EXISTED inside
//      the blob — mask and pattern were literally the same region
// Fixed by uPatSpeed/uPatReach (its own path, unrelated periods),
// uMaskCoupling (scales the drag), and BLUR.floor in the bake.
//
// Own textures only. bake-bg-textures.mjs output, no reference assets:
// the noise is MIT and reusable, his images aren't.
//
// REFERENCE
//   Keita Yamada — https://p5aholic.me/
//     The shader structure is his: grain → polar warp offset via
//     cos/sin(g · 2π); the 0.5 and 0.1 mask couplings that let the glow
//     reach into the warp and the frequency; pow(n · 1.05, k) → smoothstep
//     as the contrast curve; alpha-out = blurAlpha; and the decision that
//     a background moves but never responds.
//     His glow does NOT move — the composition is painted into his blur.png
//     and sampled 1:1. The travelling remap below is a divergence.
//   Ian McEwan / Ashima Arts, maintained by stegu — 2D simplex noise, MIT.
//   Inigo Quilez — the pattern() warp chain and its constants, from his
//     "Domain Warping" article. Yamada uses them unchanged; so do we.
//   Dave Hoskins — "Hash without Sine", MIT.
//   Mine — the NERV/SEELE palette pair (carried from Dangify), the anchored
//     wave motion, the separate pattern path, and the hash-for-angle split.

import * as THREE from "three";
import { fullscreenVert, simplex2D, hash21 } from "./shared/glsl.js";

THREE.ColorManagement.enabled = false;

// PACE — the two knobs to touch if the motion feels wrong

// FLOW scrolls the noise domain. This is the motion the eye actually reads
// as movement — everything else is slow positional shift you only notice by
// comparing across a minute.

// The number that matters is how long a feature takes to travel its own
// width. A feature is ~1 noise unit, so seconds-per-feature = 1 / FLOW:
//   0.05 → 20 s   (the old value; barely perceptible)
//   0.08 → 12 s   (the lab's slower shaders)
//   0.12 →  8 s   (the lab's faster ones)
//   0.14 →  7 s   ← x, here
//   0.22 →  4.5 s ← y, here
//   0.40 →  2.5 s (ceiling — past this the field changes faster than it
//                  travels and boils in place instead of flowing)
//
// Faster than the lab on purpose: those shaders have pointer input supplying
// motion, this one has to feel alive on its own.
const FLOW = [0.20, 0.32];

// TEMPO multiplies every SINE below — the glow's wave, the pattern's path,
// and the parameter breathing. One multiplier instead of editing nine
// numbers, and it keeps their ratios intact, which matters: the ratios are
// what stop the motions phase-locking into a visible loop.

// These are radians per second, so a cycle is 2π / speed. At TEMPO = 1
// nothing completes a cycle in under 90 seconds. At 4.0 the ripple cycles
// every 23 s and the swell every 87 s — visible without being restless.
const TEMPO = 3.0;

// GLOW PATH
const ANCHOR_X = 0.78; // glow centre, near the right edge

// The remap is (vUv - centre) / scale, so the texture spans SCALE of
// viewport height. BIGGER = BIGGER BLOB. 2.2 pushed the whole thing into
// the top-right corner; 2.6 keeps the boundary sweeping across the frame.
const GLOW_SCALE = 2.6;

// Vertical motion is two unrelated sines stacked: a slow swell with a
// faster ripple on it. One sine reads as mechanical; two unrelated periods
// read as the sea. X barely moves — just enough sway to keep it off a rail.
// All three get multiplied by TEMPO.
const SWELL_SPEED = 0.018;
const SWELL_REACH = 0.55;
const RIPPLE_SPEED = 0.067;
const RIPPLE_REACH = 0.09;
const SWAY_SPEED = 0.011;
const SWAY_REACH = 0.04;

// PATTERN PATH — the marbling travels its own route on its own periods, so
// it and the glow stop reading as one object. These speeds share no factor
// with the three above; if they did, the two motions would phase-lock and
// you'd be back to one piece sliding around. Multiplied by TEMPO, which
// preserves that relationship.
const PAT_SPEED = [0.023, 0.041];
const PAT_REACH = [0.35, 0.22];

// How hard the mask drags the pattern. 1.0 is the reference's full coupling
// the glow carries the warp field wherever it goes. Lower lets the glow
// pass OVER the marbling. 0 detaches them completely, which reads too clean;
const MASK_COUPLING = 0.55;

// PATTERN
const WARP_AMT = 0.6; // how far the domain warp pushes sample points
const FREQ = 3.0; // base noise frequency — higher is finer, busier

// The exponent in pow(n, k). Crushes mid values toward zero, so higher means
// sparser, sharper veins. 2.6 was tuned when the bake had no alpha floor and
// most of the frame was empty; with the whole surface lit that reads as
// noise. The reference hardcodes 6.0 — walk up if you want it sparser.
const CONTRAST = 3.4;

const GRAIN_SCALE = 5.0; // texels per CSS pixel
const GRAIN_SIZE = 512; // must match GRAIN.size in bake-bg-textures.mjs

// Slow oscillation so the pattern keeps RESHAPING, not just sliding. Each
// parameter breathes on its own unrelated speed — if two shared one the
// whole thing would pulse in sync and read as mechanical. `floor` clamps the
// minimum: a negative frequency or a contrast below 1 breaks the look.
// Speeds are multiplied by TEMPO in osc().
const DRIFT = {
  warpAmt: { speed: 0.021, amp: 0.28, phase: 0.0, floor: 0.0 },
  freq: { speed: 0.037, amp: 1.1, phase: 1.7, floor: 0.3 },
  contrast: { speed: 0.014, amp: 0.6, phase: 4.2, floor: 1.8 },
  glowScale: { speed: 0.026, amp: 0.3, phase: 2.1, floor: 1.2 },
};

// PALETTES — from Dangify's _nerv.scss / _seele.scss so the two projects
// agree. back = --bg-primary, front = --accent.
// These are not two darks: SEELE is the light one, "monolith clean", so the
// toggle flips the whole page. The canvas is transparent wherever blurAlpha
// falls off, which makes the page background part of the composition rather
// than a backdrop — it rides the same lerp.
const PALETTES = {
  NERV: { back: 0x0a0a0f, front: 0xc1121f },
  SEELE: { back: 0xe8e8e0, front: 0x1a3a5c },
};
const COLOR_LERP_SPEED = 2.4;

let currentPalette = "NERV";
const targetBack = new THREE.Color(PALETTES.NERV.back);
const targetFront = new THREE.Color(PALETTES.NERV.front);
const liveBack = new THREE.Color(PALETTES.NERV.back);
const liveFront = new THREE.Color(PALETTES.NERV.front);

// SHADER
const frag = `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uGrain;
  uniform sampler2D uBlur;
  uniform float uTime;
  uniform float uSeed;
  uniform vec2  uRes;
  uniform vec2  uFlow;
  uniform vec2  uPatSpeed;
  uniform vec2  uPatReach;
  uniform vec3  uBack;
  uniform vec3  uFront;

  uniform float uAnchorX, uSwellSpeed, uSwellReach;
  uniform float uRippleSpeed, uRippleReach, uSwaySpeed, uSwayReach;
  uniform float uGlowScale, uMaskCoupling;
  uniform float uWarpAmt, uFreq, uContrast, uGrainScale, uGrainSize;

  #define PI 3.14159265359

  ${simplex2D}
  ${hash21}

  // Animated noise domain — shifting the INPUT coordinates rather than
  // feeding time to the noise, so the field stays continuous instead of
  // reshuffling each frame. uFlow is the pace knob.
  float n2(vec2 p){
    return (1.0 + snoise(vec2(p.x + uTime * uFlow.x, p.y - uTime * uFlow.y + uSeed))) * 0.5;
  }

  // Domain warp — Inigo Quilez. q distorts the space r reads, r distorts
  // the space the final lookup reads. Noise inside noise inside noise, which
  // is what turns smooth blobs into flowing marble. Constants are his.
  float pattern(vec2 p){
    vec2 q = vec2(n2(p + vec2(0.0, 0.0)), n2(p + vec2(5.2, 1.3)));
    vec2 r = vec2(n2(p + 4.0 * q + vec2(1.7, 9.2)), n2(p + 4.0 * q + vec2(8.3, 2.8)));
    return n2(p + r);
  }

  void main(){
    float aspect = uRes.x / uRes.y;

    // GLOW PATH — anchored wave drift
    float swell  = sin(uTime * uSwellSpeed)  * uSwellReach;
    float ripple = sin(uTime * uRippleSpeed) * uRippleReach;
    float sway   = cos(uTime * uSwaySpeed)   * uSwayReach;

    vec2 centre = vec2(uAnchorX + sway, 0.5 + swell + ripple);

    // aspect correction keeps the blob round on wide screens
    vec2 blurUv = (vUv - centre) / uGlowScale;
    blurUv.x *= aspect;
    blurUv += 0.5;

    // No in-bounds guard. The bake carries an ambient floor now, so
    // ClampToEdge extends that uniform value rather than smearing anything —
    // and the marbling exists across the whole frame instead of only inside
    // the blob, which is what lets the two read as separate objects.
    float blurAlpha = texture2D(uBlur, blurUv).a;

    // The mask's pull on the pattern, scaled. High outside the glow, zero
    // inside. At uMaskCoupling = 1.0 these are the reference's values and the
    // glow carries the warp field with it.
    float pull = (1.0 - blurAlpha) * uMaskCoupling;

    // MAGNITUDE from the bake — irregular, with a coarse density octave
    // under the speckle. CSS pixels, not raw gl_FragCoord: at DPR 2 the
    // reference's warp field is twice as fine, so the pattern changes
    // physical scale between a laptop and an external monitor.
    vec2 grainUv = vUv * uRes * uGrainScale / uGrainSize;
    float gr = pow(texture2D(uGrain, grainUv).r, 1.5) + 0.5 * pull;

    // ANGLE from a hash — genuinely uncorrelated with gr, which reading
    // grain.g never is on a greyscale bake (and barely is on his RGB one,
    // which measures corr(R,G) = 0.877).
    float gg = hash21(gl_FragCoord.xy, uSeed);

    // Polar to Cartesian: r·cosθ, r·sinθ. Evenly distributed offsets.
    float ax = uWarpAmt * gr * cos(gg * 2.0 * PI);
    float ay = uWarpAmt * gr * sin(gg * 2.0 * PI);

    // PATTERN PATH — its own travel, unrelated periods to the glow's
    vec2 patOffset = vec2(
      sin(uTime * uPatSpeed.x) * uPatReach.x,
      cos(uTime * uPatSpeed.y) * uPatReach.y
    );

    // Both axes take the mask coupling ONCE. The old code folded the x2 into
    // a shared freq, which doubled the coupling on Y as well as the base —
    // so the vertical stretch outside the glow was twice intended.
    float ndx = uFreq + 0.1 * pull;
    float ndy = uFreq * 2.0 + 0.1 * pull;
    float n = pattern(vec2(vUv.x * ndx + ax, vUv.y * ndy + ay) + patOffset);

    // Shaping raw noise into distinct veins. max() guards the pow — snoise
    // overshoots ±1 slightly, and pow() of a negative base is undefined
    // behaviour, not merely wrong.
    n = pow(max(n * 1.05, 0.0), uContrast);
    n = smoothstep(0.0, 1.0, n);

    // Noise as blend factor, not as colour. blurAlpha becomes the canvas
    // alpha, which is why the page background is part of the composition.
    vec3 col = mix(uBack, uFront, n);
    gl_FragColor = vec4(col, blurAlpha);
  }
`;

// SETUP
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: true,
  // The shader writes STRAIGHT alpha — vec4(col, blurAlpha), colour not
  // multiplied through. Three defaults to premultipliedAlpha: true, which
  // double-counts colour in the falloff and blows the glow's edge bright.
  // Applies to 22a and 22b too.
  premultipliedAlpha: false,
});
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();

const loader = new THREE.TextureLoader();
const blurTex = loader.load("/assets/blur.png", auditBlurAlpha);
const grainTex = loader.load("/assets/grain.png");

// Single image, so clamp — repeating would tile ghost copies in once the
// drift pushes uv past the edge.
blurTex.wrapS = blurTex.wrapT = THREE.ClampToEdgeWrapping;

// RepeatWrapping does the tiling, which is why the reference's
// mod(gl_FragCoord.xy * tile, 1024.0) / 1024.0 is redundant here — and
// wrong, since this texture is 512². Hence uGrainSize as a uniform.
// NearestFilter keeps the speckle crisp; linear would mush it. Both
// textures are DATA, not colour: leave colorSpace at its default.
grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
grainTex.minFilter = THREE.NearestFilter;
grainTex.magFilter = THREE.NearestFilter;

// A flat-alpha blur has broken this project twice, and it renders a
// plausible wrong picture rather than throwing. Twelve lines to make it loud.
function auditBlurAlpha(tex) {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 64;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(tex.image, 0, 0, 64, 64);
  const px = ctx.getImageData(0, 0, 64, 64).data;
  let min = 255;
  let max = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < min) min = px[i];
    if (px[i] > max) max = px[i];
  }
  if (max - min < 8) {
    console.error(
      `[22c] blur.png has flat alpha (${min}–${max}). The glow will render ` +
        `as a hard rectangle. Lossy WebP/JPEG cannot carry alpha — use PNG ` +
        `or lossless WebP (cwebp -lossless -exact).`,
    );
  }
}

const uniforms = {
  uBlur: { value: blurTex },
  uGrain: { value: grainTex },
  uTime: { value: 0 },
  // Random per load, so no two visits open on the same frame of the pattern.
  uSeed: { value: Math.random() * 100 },
  uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },

  // FLOW is set directly — it's already tuned in absolute terms above and
  // does NOT take TEMPO, which would push it past the boiling threshold.
  uFlow: { value: new THREE.Vector2(FLOW[0], FLOW[1]) },

  // Everything below here is a sine, so everything below here takes TEMPO.
  uPatSpeed: {
    value: new THREE.Vector2(PAT_SPEED[0] * TEMPO, PAT_SPEED[1] * TEMPO),
  },
  uPatReach: { value: new THREE.Vector2(PAT_REACH[0], PAT_REACH[1]) },

  uBack: { value: liveBack },
  uFront: { value: liveFront },

  uAnchorX: { value: ANCHOR_X },
  uSwellSpeed: { value: SWELL_SPEED * TEMPO },
  uSwellReach: { value: SWELL_REACH },
  uRippleSpeed: { value: RIPPLE_SPEED * TEMPO },
  uRippleReach: { value: RIPPLE_REACH },
  uSwaySpeed: { value: SWAY_SPEED * TEMPO },
  uSwayReach: { value: SWAY_REACH },

  uGlowScale: { value: GLOW_SCALE },
  uMaskCoupling: { value: MASK_COUPLING },
  uWarpAmt: { value: WARP_AMT },
  uFreq: { value: FREQ },
  uContrast: { value: CONTRAST },
  uGrainScale: { value: GRAIN_SCALE },
  uGrainSize: { value: GRAIN_SIZE },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
  }),
);
// The vertex shader writes clip space directly and ignores both matrices, so
// the bare THREE.Camera's identity frustum happens to contain this quad. It
// works by accident — say so out loud instead of relying on it.
quad.frustumCulled = false;
scene.add(quad);

// PALETTE TOGGLE
// No separate transition loop — the file animates continuously, so the
// colour lerp rides the main frame loop. That deletes the settle-epsilon /
// transitionRaf bookkeeping the frozen draft needed.
let lastPaintedBg = "";

function paintChrome() {
  // Driven off the live lerp rather than a CSS transition, so the page
  // background and the shader's back colour can't drift apart mid-flight.
  // They have to match: the canvas is transparent wherever the glow ends.
  const hex = `#${liveBack.getHexString()}`;
  if (hex !== lastPaintedBg) {
    document.body.style.backgroundColor = hex;
    lastPaintedBg = hex;
  }
}

function setPalette(name) {
  if (name === currentPalette) return;
  currentPalette = name;
  targetBack.set(PALETTES[name].back);
  targetFront.set(PALETTES[name].front);

  // Same class names as Dangify, so the theme CSS is portable between them.
  document.body.classList.toggle("app--nerv", name === "NERV");
  document.body.classList.toggle("app--seele", name === "SEELE");

  document.querySelectorAll(".palette button").forEach((btn) => {
    const on = btn.dataset.palette === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

document.querySelectorAll(".palette button").forEach((btn) => {
  btn.addEventListener("click", () => setPalette(btn.dataset.palette));
});

// No pointermove listener. Deliberate, and the point of the file.

window.addEventListener("resize", () => {
  // Pixel ratio too, not just size — dragging between a laptop and an
  // external monitor changes DPR and the canvas stays at the old one.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

// LOOP
const start = performance.now();
let last = start;
let raf = null;

// TEMPO applies here too — DRIFT speeds are sines like all the others.
const osc = (key, base, t) => {
  const d = DRIFT[key];
  return Math.max(
    d.floor,
    base + Math.sin(t * d.speed * TEMPO + d.phase) * d.amp,
  );
};

function frame(now) {
  const t = (now - start) / 1000;
  const dt = Math.min((now - last) / 1000, 0.1); // clamped, so a backgrounded
  last = now; // tab can't jump the lerp

  uniforms.uTime.value = t;
  uniforms.uWarpAmt.value = osc("warpAmt", WARP_AMT, t);
  uniforms.uFreq.value = osc("freq", FREQ, t);
  uniforms.uContrast.value = osc("contrast", CONTRAST, t);
  uniforms.uGlowScale.value = osc("glowScale", GLOW_SCALE, t);

  // Exponential decay, framerate-independent. Not a fixed-duration tween —
  // a tween restarted mid-flight snaps, this one just re-aims.
  const lerpAmt = 1 - Math.exp(-COLOR_LERP_SPEED * dt);
  liveBack.lerp(targetBack, lerpAmt);
  liveFront.lerp(targetFront, lerpAmt);
  paintChrome();

  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
}

// A background that runs forever should stop when nobody's looking.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(raf);
    raf = null;
  } else if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
});

paintChrome();
raf = requestAnimationFrame(frame);
