// day-22 — baked texture background

// The bake lesson applied to a full-screen background: make the
// expensive, organic stuff ONCE as images, then sample cheaply

// Two textures, two jobs:
// blur.png  1024^2  a soft painted glow that travels slowly. Hand-layered
//                  gradients have irregular falloff a smoothstep can't fake
// grain.png  512^2 tileable film grain, sampled across the WHOLE frame at
//                  screen-pixel scale. Dense and fine, like emulsion

// The blur+grain texture PAIRING is studied from p5aholic.me, whose texture
// folder holds exactly this two-file set. Nothing else here is his, no
// noise library, no domain warp, no shader code That starts in 22a

// Both textures come from bake-bg-textures.mjs Re-bake before editing;
// a lossy WebP conversion previously stripped blur's alpha channel and
// silently flattened the glow into a rectangle

import * as THREE from "three";

// COLOUR MANAGEMENT
// Must come before any THREE.Color is constructed

// On r152+, `new THREE.Color(0x36404a)` converts sRGB→linear on assignment
// Built-in materials convert back on output via the colorspace_fragment
// include - ShaderMaterial does NOT, so a hand-written gl_FragColor writes
// linear values straight into an sRGB canvas, #36404a was rendering around
// #090d12. Turning management off means the hex you type is the hex you get

// Fine for a lab file authoring colours by eye, if this ever moves into
// something with lit materials or textures, turn it back on and do the
// linear→sRGB encode at the end of the fragment shader instead
THREE.ColorManagement.enabled = false;

// CONFIG
const DRIFT_X = 0.031; // horizontal travel — deliberately slow
const DRIFT_Y = 0.047; // vertical. Unrelated to X so it never loops
const REACH_X = 0.34; // how far it wanders (0..0.5)
const REACH_Y = 0.38;

// The remap below is `(vUv - centre) / scale`, so the texture spans SCALE of
// viewport height, bigger number = bigger blob
const GLOW_SCALE = 0.88;
const GLOW_STRENGTH = 1.5;

const GRAIN_SIZE = 512; // must match GRAIN.size in bake-bg-textures.mjs
const GRAIN_SCALE = 1.0; // texels per CSS pixel. 1.0 = true 1:1 emulsion
const GRAIN_AMT = 0.34; // film density, this is the big one
const GRAIN_FPS = 24; // reseed rate — 24 reads as film, 60 as digital

const COLOR_BG   = new THREE.Color(0x090d11);
const COLOR_GLOW = new THREE.Color(0xcec6b5);

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
  uniform float uGrainSize, uGrainScale, uGrainAmt, uGrainFps;

  void main(){
    float aspect = uRes.x / uRes.y;

    // THE GLOW TRAVELS
    // Two UNRELATED frequencies: the same rate on both axes traces a
    // visible circle. 0.031 vs 0.047 takes a very long time to repeat
    vec2 centre = vec2(
      0.5 + sin(uTime * uDriftX) * uReachX,
      0.5 + cos(uTime * uDriftY) * uReachY
    );

    // Sample the baked blur around the travelling centre, aspect
    // corrected so the blob stays round on wide screens
    vec2 blurUv = (vUv - centre) / uScale;
    blurUv.x *= aspect;
    blurUv += 0.5;

    // No in-bounds guard, the bake's halo already reaches zero alpha
    // before the texture edge (the bake script verifies this and prints
    // edge alpha), so ClampToEdgeWrapping smears nothing but zeroes
    // The old branch was doing work the texture already did
    float glow = texture2D(uBlur, blurUv).a * uStrength;

    vec3 col = mix(uBg, uGlow, clamp(glow, 0.0, 1.0));

    // GRAIN ACROSS THE WHOLE FRAME
    // vUv * uRes is CSS pixels, so dividing by the texture size gives one
    // texel per CSS pixel - grain stays the same physical size on a phone
    // and a 4K monitor. The old code divided by 150 instead of 512, which
    // crushed 512 texels into 150px: 3.4x minification against a
    // NearestFilter, which is exactly how you get crawling and aliasing
    vec2 gUv1 = vUv * uRes / uGrainSize * uGrainScale;

    // Second sample at an unrelated scale. This isn't about the fine
    // speckle - a repeating speckle is invisible, it's about the baked
    // COARSE octave, whose density clumps would otherwise visibly repeat
    // every 512px across a wide screen
    vec2 gUv2 = vUv * uRes / uGrainSize * uGrainScale * 1.7 + 0.37;

    // Reseed in steps rather than continuously - grain that updates every
    // frame at 120fps looks digital, ~24 reads as film
    float seed = floor(uTime * uGrainFps);
    gUv1 += vec2(fract(seed * 0.137), fract(seed * 0.271));
    gUv2 += vec2(fract(seed * 0.419), fract(seed * 0.653));

    // The bake holds its mean at exactly 0.5, so subtracting 0.5 here
    // gives a signed offset with no DC brightness shift.
    float g1 = texture2D(uGrain, gUv1).r - 0.5;
    float g2 = texture2D(uGrain, gUv2).r - 0.5;
    float grain = (g1 * 0.68 + g2 * 0.32) * uGrainAmt;

    // Applied to EVERYTHING, not just the lit areas - that's what makes
    // it read as film stock rather than a vignette
    col += grain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// SETUP
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // pairs with ColorManagement off
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();

const loader = new THREE.TextureLoader();
const blurTex = loader.load("/assets/blur.png");
const grainTex = loader.load("/assets/grain.png");

// Clamp, don't repeat - the glow is a single blob, and repeating it would
// tile ghost copies in once the drift pushes uv past the edge
blurTex.wrapS = blurTex.wrapT = THREE.ClampToEdgeWrapping;

// RepeatWrapping is what lets the grain tile seamlessly at any scale
// NearestFilter keeps the speckle crisp - linear filtering blurs it into
// mush. Both textures are DATA, not colour: leave colorSpace at its
// default (NoColorSpace) Tagging them SRGBColorSpace re-curves the values
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
  uGrainSize: { value: GRAIN_SIZE },
  uGrainScale: { value: GRAIN_SCALE },
  uGrainAmt: { value: GRAIN_AMT },
  uGrainFps: { value: GRAIN_FPS },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
  }),
);
// The vertex shader writes clip space directly and ignores both matrices,
// so the bare THREE.Camera's identity frustum happens to contain this quad
// It works by accident - say so out loud instead of relying on it
quad.frustumCulled = false;
scene.add(quad);

window.addEventListener("resize", () => {
  // Pixel ratio too, not just size - dragging between a laptop and an
  // external monitor changes DPR, and the canvas stays at the old one
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
