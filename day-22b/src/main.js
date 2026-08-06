// day-22b — anchored wave drift
//
// CORRECTION to what this file used to claim. Two things it asserted
// about the reference turned out not to hold once I read the actual
// bundled shader:
//
// 1. The glow does NOT move on keita-yamada.com. His fragment shader is
//    `texture2D(blurTex, uv).a` — raw uv, 1:1, no centre, no scale, no
//    time. The off-centre composition is PAINTED INTO his blur.png. What
//    I read as "anchored motion" is a static asymmetric image.
//    So this file is not a match attempt. It's the opposite approach:
//    a symmetric bake, composed and animated in-shader. That's a real
//    divergence and arguably the more useful one — the composition is
//    repositionable at runtime instead of being one fixed image — but it
//    is mine, not his, and the header shouldn't have said otherwise.
//
// 2. "grain texture now has independent R/G channels" was never true.
//    bake-bg-textures.mjs writes R=G=B; the update it referred to didn't
//    exist. Measured on the asset that was actually in /assets,
//    corr(R,G) = 0.877 — so the warp angle was ~88% predictable from the
//    warp magnitude, and ax/ay traced a spiral rather than scattering.
//    Fixed the way 22a does it now: magnitude from the bake, angle from
//    a hash.
//
// Also: GLOW_SCALE was documented backwards. The remap is
// (vUv - centre) / scale, so the texture spans SCALE of viewport height.
// 0.42 was a blob at 42% of screen height — a small tight ball, the exact
// opposite of the "mostly off-frame" note sitting next to it. Everything
// tuned against that value was tuned against the wrong shape.
//
// No GUI here. 22a is the lab where you compare; this file's job is to
// commit to one composition, and a GUI on a committed composition means
// the file has no answer. The CONFIG block below is the tuning surface.
// Dropping it also removes the jsDelivr import from the page.
//
// Noise: simplex only. 22a carries both behind a toggle so you can see
// the difference; here we take the reference's choice and move on.
//
// Attribution: REFERENCE.md. snoise is Ashima/McEwan (MIT, header kept
// below). The pattern() warp chain and its constants are Inigo Quilez's
// "Domain Warping". The grain→polar-offset idea and the blurAlpha
// couplings are Yamada's. Anchored composition and wave drift are mine.

import * as THREE from "three";

THREE.ColorManagement.enabled = false;

// CONFIG — this is the tuning surface now that the GUI is gone
const ANCHOR_X = 0.78; // glow centre, near the right edge

// >1 = blob LARGER than the viewport, mostly off-frame, only its curved
// boundary in view. This is what 0.42 was supposed to be doing and wasn't.
const GLOW_SCALE = 2.2;

const SWELL_SPEED = 0.018; // slow rise/fall — the big "sea" motion
const SWELL_REACH = 0.55;
const RIPPLE_SPEED = 0.067; // faster, smaller — texture on top of the swell
const RIPPLE_REACH = 0.09;
const SWAY_SPEED = 0.011; // tiny horizontal give, keeps it off a rail
const SWAY_REACH = 0.04;

const WARP_AMT = 0.6;
const FREQ = 3.0;
const CONTRAST = 4.5;
const GRAIN_SCALE = 5.0; // texels per CSS pixel
const GRAIN_SIZE = 512; // must match GRAIN.size in bake-bg-textures.mjs

const COLOR_BACK = new THREE.Color(0x14181c);
const COLOR_FRONT = new THREE.Color(0x8f897c);

// Each parameter breathes on its own unrelated speed — if two shared a
// speed the whole shape would pulse in sync and read as mechanical.
// glowScale amp scaled up from 0.08: it was proportional to a base of
// 0.42, and the base is now 2.2.
const DRIFT = {
  warpAmt: { speed: 0.021, amp: 0.28, phase: 0.0, floor: 0.0 },
  freq: { speed: 0.037, amp: 1.1, phase: 1.7, floor: 0.3 },
  contrast: { speed: 0.014, amp: 0.8, phase: 4.2, floor: 1.0 },
  glowScale: { speed: 0.026, amp: 0.25, phase: 2.1, floor: 1.0 },
};

// SHADER
const vert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const frag = `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uGrain;
  uniform sampler2D uBlur;
  uniform float uTime;
  uniform float uSeed;
  uniform vec2  uRes;
  uniform vec3  uBack;
  uniform vec3  uFront;

  uniform float uAnchorX, uSwellSpeed, uSwellReach;
  uniform float uRippleSpeed, uRippleReach, uSwaySpeed, uSwayReach;
  uniform float uGlowScale;
  uniform float uWarpAmt, uFreq, uContrast, uGrainScale, uGrainSize;

  #define PI 3.14159265359

  //
  // Description : Array and textureless GLSL 2D simplex noise function.
  //      Author : Ian McEwan, Ashima Arts.
  //  Maintainer : stegu
  //     Lastmod : 20110822 (ijm)
  //     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
  //               Distributed under the MIT License. See LICENSE file.
  //               https://github.com/ashima/webgl-noise
  //               https://github.com/stegu/webgl-noise
  //
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x){ return mod289(((x*34.0)+10.0)*x); }

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // "Hash without Sine" — Dave Hoskins, https://www.shadertoy.com/view/4djSRW (MIT)
  float hash21(vec2 p, float seed){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33 + seed);
    return fract((p3.x + p3.y) * p3.z);
  }

  float n2(vec2 p){
    return (1.0 + snoise(vec2(p.x + uTime * 0.02, p.y - uTime * 0.04 + uSeed))) * 0.5;
  }

  // Domain warp — Inigo Quilez. q distorts the space r reads, r distorts
  // the space the final lookup reads.
  float pattern(vec2 p){
    vec2 q = vec2(n2(p + vec2(0.0, 0.0)), n2(p + vec2(5.2, 1.3)));
    vec2 r = vec2(n2(p + 4.0 * q + vec2(1.7, 9.2)), n2(p + 4.0 * q + vec2(8.3, 2.8)));
    return n2(p + r);
  }

  void main(){
    float aspect = uRes.x / uRes.y;

    // ANCHORED WAVE DRIFT
    // X barely moves — a small sway around a fixed anchor near the edge.
    // Y is a slow swell plus a faster ripple, two unrelated periods, so the
    // combined motion never settles into an obvious loop. One sine reads as
    // mechanical; two unrelated ones read as the sea.
    float swell  = sin(uTime * uSwellSpeed)  * uSwellReach;
    float ripple = sin(uTime * uRippleSpeed) * uRippleReach;
    float sway   = cos(uTime * uSwaySpeed)   * uSwayReach;

    vec2 centre = vec2(uAnchorX + sway, 0.5 + swell + ripple);

    // At uGlowScale 2.2 with a 16:9 viewport, blurUv.x runs about
    // -0.13 .. 0.68 — the blob's peak sits at vUv.x = uAnchorX and the far
    // left falls outside the texture entirely. ClampToEdge returns zero
    // alpha there (the bake's halo reaches zero before the edge, and the
    // bake script prints edge alpha to prove it), so the old in-bounds
    // branch was doing work the texture already did.
    vec2 blurUv = (vUv - centre) / uGlowScale;
    blurUv.x *= aspect;
    blurUv += 0.5;

    float blurAlpha = texture2D(uBlur, blurUv).a;

    // MAGNITUDE from the bake — irregular, with a coarse density octave
    // underneath. CSS pixels, not raw gl_FragCoord: at DPR 2 the reference's
    // warp field is twice as fine, so the pattern changes scale between a
    // laptop and an external monitor.
    vec2 grainUv = vUv * uRes * uGrainScale / uGrainSize;
    float gr = pow(texture2D(uGrain, grainUv).r, 1.5) + 0.5 * (1.0 - blurAlpha);

    // ANGLE from a hash — genuinely uncorrelated with gr, which reading
    // grain.g never was. See the correction at the top of this file.
    float gg = hash21(gl_FragCoord.xy, uSeed);

    float ax = uWarpAmt * gr * cos(gg * 2.0 * PI);
    float ay = uWarpAmt * gr * sin(gg * 2.0 * PI);

    float freq = uFreq + 0.1 * (1.0 - blurAlpha);
    float n = pattern(vec2(vUv.x * freq + ax, vUv.y * freq * 2.0 + ay));

    // max() guards the pow — snoise overshoots ±1 slightly and pow() of a
    // negative base is undefined behaviour, not merely wrong.
    n = pow(max(n * 1.05, 0.0), uContrast);
    n = smoothstep(0.0, 1.0, n);

    vec3 col = mix(uBack, uFront, n);
    gl_FragColor = vec4(col, blurAlpha);
  }
`;

// SETUP
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();

// Own bake now — the "these are Yamada's assets, don't ship" TODO is
// resolved. blur.png / grain.png come from bake-bg-textures.mjs.
const loader = new THREE.TextureLoader();
const blurTex = loader.load("/assets/blur.png");
const grainTex = loader.load("/assets/grain.png");

blurTex.wrapS = blurTex.wrapT = THREE.ClampToEdgeWrapping;

// RepeatWrapping does the tiling, which is why the old
// mod(gl_FragCoord.xy * tile, 1024.0) / 1024.0 was redundant — and wrong
// besides, since this texture is 512², not 1024². Both are DATA, not
// colour: leave colorSpace at its default (NoColorSpace).
grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
grainTex.minFilter = THREE.NearestFilter;
grainTex.magFilter = THREE.NearestFilter;

const uniforms = {
  uBlur: { value: blurTex },
  uGrain: { value: grainTex },
  uTime: { value: 0 },
  uSeed: { value: Math.random() * 100 },
  uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uBack: { value: COLOR_BACK },
  uFront: { value: COLOR_FRONT },

  uAnchorX: { value: ANCHOR_X },
  uSwellSpeed: { value: SWELL_SPEED },
  uSwellReach: { value: SWELL_REACH },
  uRippleSpeed: { value: RIPPLE_SPEED },
  uRippleReach: { value: RIPPLE_REACH },
  uSwaySpeed: { value: SWAY_SPEED },
  uSwayReach: { value: SWAY_REACH },

  uGlowScale: { value: GLOW_SCALE },
  uWarpAmt: { value: WARP_AMT },
  uFreq: { value: FREQ },
  uContrast: { value: CONTRAST },
  uGrainScale: { value: GRAIN_SCALE },
  uGrainSize: { value: GRAIN_SIZE },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
  }),
);
quad.frustumCulled = false;
scene.add(quad);

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

const start = performance.now();
function frame(now) {
  const t = (now - start) / 1000;
  uniforms.uTime.value = t;

  // Drift is unconditional now — with no GUI there's nothing to freeze for.
  const osc = (key, base) => {
    const d = DRIFT[key];
    return Math.max(d.floor, base + Math.sin(t * d.speed + d.phase) * d.amp);
  };
  uniforms.uWarpAmt.value = osc("warpAmt", WARP_AMT);
  uniforms.uFreq.value = osc("freq", FREQ);
  uniforms.uContrast.value = osc("contrast", CONTRAST);
  uniforms.uGlowScale.value = osc("glowScale", GLOW_SCALE);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
