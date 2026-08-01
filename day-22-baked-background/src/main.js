// day-22 - baked texture background

// The Day 16c lesson applied to a full-screen background: bake the
// expensive, organic stuff ONCE as images, then sample cheaply.

// Two textures, two jobs:
//   blur.png  - a soft painted glow that travels slowly. hand-layered
//               gradients have irregular falloff a smoothstep can't fake
//   grain.png - tileable film grain, sampled across the WHOLE frame at
//               screen-pixel scale. dense and fine, like emulsion
//
// Studied from p5aholic.me, whose texture folder holds exactly this pair, rebuilt from the principle

import * as THREE from "three";

// CONFIG
const DRIFT_X = 0.031; // horizontal travel - deliberately slow
const DRIFT_Y = 0.047; // vertical. unrelated to X so it never loops
const REACH_X = 0.34; // how far it wanders (0..0.5)
const REACH_Y = 0.38;
const GLOW_SCALE = 0.88; // <1 = blob wider than the viewport
const GLOW_STRENGTH = 1.5;

const GRAIN_TILE = 150; // px per tile - smaller = finer grain
const GRAIN_AMT = 0.34; // film density, this is the big one
const GRAIN_FPS = 24; // reseed rate - 24 reads as film, 60 as digital

const COLOR_BG = new THREE.Color(0x36404a);
const COLOR_GLOW = new THREE.Color(0xe8e4db);

// SHADER
const vert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const frag = `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uBlur;
  uniform sampler2D uGrain;
  uniform float uTime;
  uniform vec2  uRes;
  uniform vec3  uBg;
  uniform vec3  uGlow;
  uniform float uDriftX, uDriftY, uReachX, uReachY;
  uniform float uScale, uStrength;
  uniform float uTile, uGrainAmt, uGrainFps;

  void main(){
    float aspect = uRes.x / uRes.y;

    // THE GLOW TRAVELS
    // two UNRELATED frequencies: same rate on both axes would trace a
    // visible circle, 0.031 vs 0.047 takes a very long time to repeat
    vec2 centre = vec2(
      0.5 + sin(uTime * uDriftX) * uReachX,
      0.5 + cos(uTime * uDriftY) * uReachY
    );

    // sample the baked blur around the travelling centre, aspect
    // corrected so the blob stays round on wide screens
    vec2 blurUv = (vUv - centre) / uScale;
    blurUv.x *= aspect;
    blurUv += 0.5;

    // outside 0..1 there is no texture - guard or you smear clamped
    // edge pixels across the frame
    float glow = 0.0;
    if (blurUv.x > 0.0 && blurUv.x < 1.0 && blurUv.y > 0.0 && blurUv.y < 1.0) {
      glow = texture2D(uBlur, blurUv).a * uStrength;
    }

    vec3 col = mix(uBg, uGlow, clamp(glow, 0.0, 1.0));

    // GRAIN ACROSS THE WHOLE FRAME
    // scaled by RESOLUTION not uv, so grain is the same physical size
    // on a phone and a 4K monitor, two offset samples at different
    // scales so the pattern doesn't read as an obvious repeating tile
    vec2 gUv1 = vUv * uRes / uTile;
    vec2 gUv2 = vUv * uRes / (uTile * 1.7) + 0.37;

    // reseed in steps rather than continuously - grain that updates
    // every frame at 120fps looks digital; ~24 reads as film
    float seed = floor(uTime * uGrainFps);
    gUv1 += vec2(fract(seed * 0.137), fract(seed * 0.271));
    gUv2 += vec2(fract(seed * 0.419), fract(seed * 0.653));

    float g1 = texture2D(uGrain, gUv1).r - 0.5;
    float g2 = texture2D(uGrain, gUv2).r - 0.5;
    float grain = (g1 * 0.68 + g2 * 0.32) * uGrainAmt;

    // applied to EVERYTHING, not just the lit areas - that's what
    // makes it read as film stock rather than a vignette
    col += grain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// SETUP
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();

const loader = new THREE.TextureLoader();
const blurTex = loader.load("/assets/blur.png");
const grainTex = loader.load("/assets/grain.png");

// RepeatWrapping is what lets the grain tile seamlessly at any scale
// NearestFilter keeps the speckle crisp - linear filtering would blur
// it into mush at small tile sizes
grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
grainTex.minFilter = THREE.NearestFilter;
grainTex.magFilter = THREE.NearestFilter;

const uniforms = {
  uBlur: { value: blurTex },
  uGrain: { value: grainTex },
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uBg: { value: COLOR_BG },
  uGlow: { value: COLOR_GLOW },
  uDriftX: { value: DRIFT_X },
  uDriftY: { value: DRIFT_Y },
  uReachX: { value: REACH_X },
  uReachY: { value: REACH_Y },
  uScale: { value: GLOW_SCALE },
  uStrength: { value: GLOW_STRENGTH },
  uTile: { value: GRAIN_TILE },
  uGrainAmt: { value: GRAIN_AMT },
  uGrainFps: { value: GRAIN_FPS },
};

scene.add(
  new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms,
    }),
  ),
);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

const start = performance.now();
function frame(now) {
  uniforms.uTime.value = (now - start) / 1000;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
