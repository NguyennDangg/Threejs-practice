// day-17 — baked type, brought alive: dither reveal/hide loop + fluid
// distort on hover + ambient drift. The image is the STATIC layer
// (baked by bake-type.mjs); the shaders are the thin LIVE layer —
// the Yuta model applied to type, fusing 16d (dither) and 16f (fluid).
import * as THREE from "three";

/* CONFIG */
const IMAGE = "/assets/type-signal-lost.png";

// reveal/hide cycle (16d)
const HOLD_BLACK = 1.0; // black before it assembles (seconds)
const REVEAL_T = 2.5; // dither-in duration
const SHOW = 4.0; // how long it stays fully visible
const HIDE_T = 2.0; // dither-out duration
const EDGE = 0.12; // softness of the reveal wave

// fluid (scatter effect from study lab)
const DECAY = 0.985; // ripple settle — closer to 1 = lingers longer
const RADIUS = 0.12; // cursor influence radius (UV)
const PUSH = 6.0; // how hard the cursor stirs
const DISTORT = 0.04; // how far the fluid shoves the type

// ambient drift (makes the static image breathe)
const DRIFT = 0.004; // amplitude of the always-on wobble

/* SHARED */
const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

/* FLUID PASS - velocity field (from x_scatter) */
const fluidFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uMouse, uMousePrev;
  uniform float uRadius, uPush, uDecay;
  void main(){
    vec2 uv = vUv;
    float b = 0.009;
    // diffuse
    vec2 vel = vec2(0.0);
    vel += texture2D(uPrev, uv + vec2(-b,-b)).rg;
    vel += texture2D(uPrev, uv + vec2( 0.0,-b)).rg;
    vel += texture2D(uPrev, uv + vec2( b,-b)).rg;
    vel += texture2D(uPrev, uv + vec2(-b, 0.0)).rg;
    vel += texture2D(uPrev, uv).rg * 2.0;
    vel += texture2D(uPrev, uv + vec2( b, 0.0)).rg;
    vel += texture2D(uPrev, uv + vec2(-b, b)).rg;
    vel += texture2D(uPrev, uv + vec2( 0.0, b)).rg;
    vel += texture2D(uPrev, uv + vec2( b, b)).rg;
    vel /= 10.0;
    // advect
    vec2 upstream = clamp(uv - vel * 0.03, 0.0, 1.0);
    vel = mix(vel, texture2D(uPrev, upstream).rg, 0.7);
    vel *= uDecay;
    // inject
    vec2 mouseUv = uMouse * 0.5 + 0.5;
    vec2 mouseDelta = (uMouse - uMousePrev) * uPush;
    float influence = smoothstep(uRadius, 0.0, distance(uv, mouseUv));
    vel += mouseDelta * influence;
    gl_FragColor = vec4(vel, 0.0, 1.0);
  }
`;

/* DISPLAY - baked image, fluid-distorted + drifting + dithered */
const displayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uImage;   // the baked type PNG
  uniform sampler2D uFluid;   // velocity field
  uniform vec2 uRes;
  uniform float uReveal;
  uniform float uEdge, uDistort, uTime, uDrift;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float hash1(float n){ return fract(sin(n) * 43758.5453); }

  void main(){
    // fluid velocity (hover push) + ambient drift (always-on breathe)
    vec2 vel = texture2D(uFluid, vUv).rg;
    vec2 drift = vec2(
      sin(vUv.y * 8.0 + uTime * 0.6),
      cos(vUv.x * 8.0 + uTime * 0.5)
    ) * uDrift;

    // EFFECT 1: GLITCH SLICES
    // chop the image into 40 horizontal rows; a few random rows jump
    // sideways each moment. reads as signal interference.
    float slice = floor(vUv.y * 40.0);
    float glitch = step(0.92, hash1(slice + floor(uTime * 8.0))) * 0.05;

    // final distorted lookup coordinate (all the uv-warps combined)
    vec2 uv = vUv + vel * uDistort + drift + vec2(glitch, 0.0);

    // EFFECT 2: CHROMATIC ABERRATION
    // sample the image 3x at offset positions for R / G / B, so edges
    // get red/blue fringes — stronger where you stir the fluid.
    float sep = 0.003 + length(vel) * 0.05;
    float r = texture2D(uImage, uv + vec2(sep, 0.0)).r;
    float g = texture2D(uImage, uv).g;
    float b = texture2D(uImage, uv - vec2(sep, 0.0)).b;
    vec3 img = vec3(r, g, b);

    // EFFECT 3: SCANLINES
    // fine horizontal brightness bands, slowly scrolling — CRT flavor.
    float scan = 0.9 + 0.1 * sin(vUv.y * 800.0 + uTime * 5.0);
    img *= scan;

    // dither reveal/hide
    vec2 px = floor(vUv * uRes / 6.0);
    float threshold = hash(px);
    float show = smoothstep(threshold - uEdge, threshold + uEdge, uReveal);

    gl_FragColor = vec4(img * show, 1.0);
  }
`;

/* SETUP */
const renderer = new THREE.WebGLRenderer({ antialias: true });
const dpr = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.Camera();
const quad = new THREE.PlaneGeometry(2, 2);

const loader = new THREE.TextureLoader();
const typeTexture = loader.load(IMAGE);
typeTexture.minFilter = THREE.LinearFilter;
typeTexture.magFilter = THREE.LinearFilter;

const SIM = 256;
let simW = SIM,
  simH = Math.round(SIM * (window.innerHeight / window.innerWidth));
function makeRT() {
  return new THREE.WebGLRenderTarget(simW, simH, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
}
let rtA = makeRT();
let rtB = makeRT();

const fluidScene = new THREE.Scene();
const fluidMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: fluidFragment,
  uniforms: {
    uPrev: { value: rtA.texture },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uMousePrev: { value: new THREE.Vector2(0, 0) },
    uRadius: { value: RADIUS },
    uPush: { value: PUSH },
    uDecay: { value: DECAY },
  },
});
fluidScene.add(new THREE.Mesh(quad, fluidMat));

const displayScene = new THREE.Scene();
const displayMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: displayFragment,
  uniforms: {
    uImage: { value: typeTexture },
    uFluid: { value: rtA.texture },
    uRes: {
      value: new THREE.Vector2(
        window.innerWidth * dpr,
        window.innerHeight * dpr,
      ),
    },
    uReveal: { value: 0 },
    uEdge: { value: EDGE },
    uDistort: { value: DISTORT },
    uTime: { value: 0 },
    uDrift: { value: DRIFT },
  },
});
displayScene.add(new THREE.Mesh(quad, displayMat));

/* pointer (-1..1 for the fluid) */
const target = new THREE.Vector2(0, 0);
const smooth = new THREE.Vector2(0, 0);
const prev = new THREE.Vector2(0, 0);
window.addEventListener("pointermove", (e) => {
  target.x = (e.clientX / window.innerWidth) * 2 - 1;
  target.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

/* resize */
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  simH = Math.round(SIM * (window.innerHeight / window.innerWidth));
  rtA.dispose();
  rtB.dispose();
  rtA = makeRT();
  rtB = makeRT();
  displayMat.uniforms.uRes.value.set(
    window.innerWidth * dpr,
    window.innerHeight * dpr,
  );
});

/* loop */
const OMEGA = 14;
let last = performance.now();
const start = last;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const a = Math.exp(-OMEGA * dt);
  prev.copy(smooth);
  smooth.x = target.x + (smooth.x - target.x) * a;
  smooth.y = target.y + (smooth.y - target.y) * a;

  // PASS 1 - evolve fluid
  fluidMat.uniforms.uPrev.value = rtA.texture;
  fluidMat.uniforms.uMousePrev.value.copy(prev);
  fluidMat.uniforms.uMouse.value.copy(smooth);
  renderer.setRenderTarget(rtB);
  renderer.render(fluidScene, camera);
  [rtA, rtB] = [rtB, rtA];

  const t = (now - start) * 0.001;

  // reveal/hide cycle: black → dither-in → hold → dither-out → repeat
  const CYCLE = HOLD_BLACK + REVEAL_T + SHOW + HIDE_T;
  const cyc = t % CYCLE;
  let reveal;
  if (cyc < HOLD_BLACK) reveal = 0.0;
  else if (cyc < HOLD_BLACK + REVEAL_T) reveal = (cyc - HOLD_BLACK) / REVEAL_T;
  else if (cyc < HOLD_BLACK + REVEAL_T + SHOW) reveal = 1.0;
  else reveal = 1.0 - (cyc - HOLD_BLACK - REVEAL_T - SHOW) / HIDE_T;
  reveal = reveal * reveal * (3.0 - 2.0 * reveal); // ease both ways
  reveal = reveal * (1.0 + 2.0 * 0.12) - 0.12;

  // PASS 2 - display
  displayMat.uniforms.uFluid.value = rtA.texture;
  displayMat.uniforms.uReveal.value = reveal;
  displayMat.uniforms.uTime.value = t;
  renderer.setRenderTarget(null);
  renderer.render(displayScene, camera);

  requestAnimationFrame(frame);
}
frame(performance.now());
