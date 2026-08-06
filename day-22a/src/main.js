// day-22a — domain-warped marbling
//
// This is where the study of p5aholic.me (Keita Yamada) actually starts.
// day-22 borrowed only his two-texture pairing; from here the shader
// structure is his. Being precise about what's whose:
//
//   HIS  — grain.r → warp MAGNITUDE, grain.g → warp ANGLE via
//          cos/sin(g * 2π); the `+ 0.5 * (1 - blurAlpha)` and
//          `+ 0.1 * (1 - blurAlpha)` couplings that let the glow shape
//          reach into the warp and the frequency; pow(n * 1.05, k) →
//          smoothstep as the contrast curve; alpha-out = blurAlpha.
//   IQ   — the pattern() q/r chain and its constants, from Inigo Quilez's
//          "Domain Warping" article. Yamada uses them unchanged; so do we.
//   MINE — palette, GUI, the parameter drift, the in-shader composition
//          remap, and the hash-for-angle split below.
//
// This file is close to a port, not an interpretation. REFERENCE.md says
// so plainly. Diverging is 22b/22c's job, not this one's.
//
// NOISE: Yamada uses simplex (noise2D.glsl). We had classic Perlin
// (classicnoise2D.glsl). Both are here with a GUI toggle — that A/B is
// the whole reason this file keeps a GUI while 22b/22c don't. Simplex is
// cheaper and its ridges run at a visibly different angle; Perlin's
// grid-axis bias is easier to see once you know to look for it.

import * as THREE from "three";
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm";

// Same two lines as day-22 — keep the whole day consistent. If you decide
// to revert there to keep the old darker falloff, revert here too.
THREE.ColorManagement.enabled = false;

// CONFIG
const DRIFT_X = 0.031;
const DRIFT_Y = 0.047;
const REACH_X = 0.34;
const REACH_Y = 0.38;

const GRAIN_SIZE = 512; // must match GRAIN.size in bake-bg-textures.mjs

const COLOR_BACK = new THREE.Color(0x36404a);
const COLOR_FRONT = new THREE.Color(0xe8e4db);

// Each parameter breathes on its own unrelated speed — if two shared a
// speed the whole shape would pulse in sync and read as mechanical.
const DRIFT = {
  warpAmt: { speed: 0.021, amp: 0.28, phase: 0.0 },
  freq: { speed: 0.037, amp: 1.1, phase: 1.7 },
  contrast: { speed: 0.014, amp: 1.6, phase: 4.2 },
  glowScale: { speed: 0.026, amp: 0.14, phase: 2.1 },
};

// GUI edits these "base" values — drift oscillates around them, so
// turning drift off just freezes on whatever you dialled in.
const params = {
  autoDrift: true,
  simplex: true, // true = Yamada's snoise, false = the cnoise we had
  warpAmt: 0.6,
  freq: 3.0,
  grainScale: 5.0, // texels per CSS pixel
  contrast: 4.5,
  // The remap is (vUv - centre) / scale, so the texture spans SCALE of
  // viewport height. BIGGER = BIGGER BLOB. Three of the four day-22 files
  // had this comment backwards. 1.0 exactly fills the viewport height.
  glowScale: 0.88,
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
  uniform float uSimplex;

  uniform float uDriftX, uDriftY, uReachX, uReachY, uGlowScale;
  uniform float uWarpAmt, uFreq, uContrast, uGrainScale, uGrainSize;

  #define PI 3.14159265359

  //
  // GLSL textureless classic 2D noise "cnoise",
  // with an RSL-style periodic variant "pnoise".
  // Author:  Stefan Gustavson (stefan.gustavson@liu.se)
  // Version: 2024-11-07
  //
  // Many thanks to Ian McEwan of Ashima Arts for the
  // ideas for permutation and gradient selection.
  //
  // Copyright (c) 2011 Stefan Gustavson. All rights reserved.
  // Distributed under the MIT license. See LICENSE file.
  // https://github.com/stegu/webgl-noise
  //
  vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x*34.0)+10.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  vec2 fade(vec2 t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }

  float cnoise(vec2 P){
    vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
    vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
    Pi = mod289(Pi);
    vec4 ix = Pi.xzxz, iy = Pi.yyww;
    vec4 fx = Pf.xzxz, fy = Pf.yyww;
    vec4 i = permute(permute(ix) + iy);
    vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
    vec4 gy = abs(gx) - 0.5;
    vec4 tx = floor(gx + 0.5);
    gx = gx - tx;
    vec2 g00 = vec2(gx.x,gy.x), g10 = vec2(gx.y,gy.y);
    vec2 g01 = vec2(gx.z,gy.z), g11 = vec2(gx.w,gy.w);
    vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
    float n00 = norm.x * dot(g00, vec2(fx.x, fy.x));
    float n10 = norm.y * dot(g10, vec2(fx.y, fy.y));
    float n01 = norm.z * dot(g01, vec2(fx.z, fy.z));
    float n11 = norm.w * dot(g11, vec2(fx.w, fy.w));
    vec2 fade_xy = fade(Pf.xy);
    vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
    return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
  }

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
  // This is the one the reference site actually uses. The mod289/permute
  // names collide with the block above, but the OVERLOADS differ (vec2/vec3
  // here, vec4 there) so GLSL resolves them fine — no need to delete either,
  // despite what the webgl-noise README warns about.
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

  // "Hash without Sine" — Dave Hoskins, https://www.shadertoy.com/view/4djSRW
  // (MIT). Replaces the sin(dot(...)) hash: that one feeds sin() arguments
  // past 500,000 on a 4K display at DPR 2, well beyond where a 24-bit
  // mantissa holds up, and you get banding instead of noise.
  float hash21(vec2 p, float seed){
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33 + seed);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Dynamic branch — both noise paths compile, only one runs per fragment.
  // Fine for a lab file; if this ever ships, pick one and #define it out.
  float noise01(vec2 v){
    if (uSimplex > 0.5) return (1.0 + snoise(v)) * 0.5;
    return (1.0 + cnoise(v)) * 0.5;
  }

  float n2(vec2 p){
    return noise01(vec2(p.x + uTime * 0.02, p.y - uTime * 0.04 + uSeed));
  }

  // Domain warp — Inigo Quilez. q distorts the space r reads, r distorts
  // the space the final lookup reads. Constants are his, unchanged.
  float pattern(vec2 p){
    vec2 q = vec2(n2(p + vec2(0.0, 0.0)), n2(p + vec2(5.2, 1.3)));
    vec2 r = vec2(n2(p + 4.0 * q + vec2(1.7, 9.2)), n2(p + 4.0 * q + vec2(8.3, 2.8)));
    return n2(p + r);
  }

  void main(){
    float aspect = uRes.x / uRes.y;

    // Two UNRELATED frequencies, so the path never traces a visible circle.
    vec2 centre = vec2(
      0.5 + sin(uTime * uDriftX) * uReachX,
      0.5 + cos(uTime * uDriftY) * uReachY
    );

    vec2 blurUv = (vUv - centre) / uGlowScale;
    blurUv.x *= aspect;
    blurUv += 0.5;

    // No in-bounds guard — the bake's halo already reaches zero alpha
    // before the texture edge, so ClampToEdge smears nothing but zeroes.
    float blurAlpha = texture2D(uBlur, blurUv).a;

    // MAGNITUDE from the bake — irregular, with a coarse density octave
    // underneath. That's the half a hash can't fake.
    // vUv * uRes is CSS pixels. The reference uses raw gl_FragCoord, which
    // makes the warp field twice as fine at DPR 2 — the pattern literally
    // changes scale between a laptop and an external monitor. Same fix as
    // day-22's grain: work in CSS pixels.
    vec2 grainUv = vUv * uRes * uGrainScale / uGrainSize;
    float gr = pow(texture2D(uGrain, grainUv).r, 1.5) + 0.5 * (1.0 - blurAlpha);

    // ANGLE from a hash — genuinely uncorrelated with gr.
    // The reference reads this from grain.g, which only works if R and G
    // are independent. Our bake is greyscale (R == G), which would make the
    // "random" angle a deterministic function of the magnitude: ax/ay would
    // trace a spiral in offset space instead of scattering. Measured on the
    // asset that was in /assets, R and G still correlated at 0.88 — so this
    // was broken even with a colour texture. Bake supplies the organic half,
    // hash supplies the uncorrelated half.
    float gg = hash21(gl_FragCoord.xy, uSeed);

    float ax = uWarpAmt * gr * cos(gg * 2.0 * PI);
    float ay = uWarpAmt * gr * sin(gg * 2.0 * PI);

    float freq = uFreq + 0.1 * (1.0 - blurAlpha);
    float n = pattern(vec2(vUv.x * freq + ax, vUv.y * freq * 2.0 + ay));

    // max() guards the pow: both noise functions can overshoot ±1 slightly,
    // and pow() of a negative base is undefined behaviour, not just wrong.
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

const loader = new THREE.TextureLoader();
// Your own bake now — blur.png / grain.png from bake-bg-textures.mjs.
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
  uSimplex: { value: params.simplex ? 1 : 0 },
  uDriftX: { value: DRIFT_X },
  uDriftY: { value: DRIFT_Y },
  uReachX: { value: REACH_X },
  uReachY: { value: REACH_Y },
  uGlowScale: { value: params.glowScale },
  uWarpAmt: { value: params.warpAmt },
  uFreq: { value: params.freq },
  uContrast: { value: params.contrast },
  uGrainScale: { value: params.grainScale },
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

// GUI
const gui = new GUI({ title: "22a — marbling" });
gui.add(params, "simplex").name("simplex (vs perlin)");
gui.add(params, "autoDrift").name("auto drift");
gui.add(params, "warpAmt", 0, 2, 0.01).name("warp base");
gui.add(params, "freq", 0.5, 8, 0.1).name("freq base");
gui.add(params, "contrast", 1, 10, 0.1).name("contrast base");
gui.add(params, "grainScale", 1, 15, 0.5).name("grain texels/px");
gui.add(params, "glowScale", 0.3, 1.5, 0.01).name("glow scale base");

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

const start = performance.now();
function frame(now) {
  const t = (now - start) / 1000;
  uniforms.uTime.value = t;
  uniforms.uGrainScale.value = params.grainScale;
  uniforms.uSimplex.value = params.simplex ? 1 : 0;

  if (params.autoDrift) {
    const osc = (key, base, floor) =>
      Math.max(
        floor,
        base +
          Math.sin(t * DRIFT[key].speed + DRIFT[key].phase) * DRIFT[key].amp,
      );
    uniforms.uWarpAmt.value = osc("warpAmt", params.warpAmt, 0);
    uniforms.uFreq.value = osc("freq", params.freq, 0.3);
    uniforms.uContrast.value = osc("contrast", params.contrast, 1);
    uniforms.uGlowScale.value = osc("glowScale", params.glowScale, 0.2);
  } else {
    uniforms.uWarpAmt.value = params.warpAmt;
    uniforms.uFreq.value = params.freq;
    uniforms.uContrast.value = params.contrast;
    uniforms.uGlowScale.value = params.glowScale;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
