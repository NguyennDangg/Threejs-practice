// day-16b — feedback ink trail
// Two render targets (rtA, rtB) let a shader "remember" between frames:
// read last frame, fade it slightly, stamp the mouse position, write out,
// then swap so the buffer that i just wrote becomes next frame's "last frame"

import * as THREE from "three";

const DECAY = 0.6; // how fast the ink dies (frame-rate independent)
const BRUSH = 0.05; // stroke width
const STRENGTH = 1.0; // ink deposited per frame while moving
const IDLE_MS = 100; // counts as "drawing" this long after last move

const COLOR_BG = new THREE.Color(0x0f1418);
const COLOR_INK = new THREE.Color(0x5a7d8c);

const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

// PASS 1 — sim: read, fade, stamp, write
const simFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uMouse, uPrevMouse;
  uniform float uAspect;
  uniform float uDecayAmt;
  uniform float uBrush, uStrength, uActive;

  float segDist(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main(){
    float prev = texture2D(uPrev, vUv).r * uDecayAmt;

    vec2 p  = vec2(vUv.x * uAspect, vUv.y);
    vec2 m  = vec2(uMouse.x * uAspect, uMouse.y);
    vec2 pm = vec2(uPrevMouse.x * uAspect, uPrevMouse.y);

    float d = segDist(p, pm, m);
    float add = smoothstep(uBrush, 0.0, d) * uStrength * uActive;

    gl_FragColor = vec4(max(prev, add), 0.0, 0.0, 1.0);
  }
`;

// PASS 2 — display: color the ink buffer
const displayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec3 uColorBg, uColorInk;
  void main(){
    float ink = clamp(texture2D(uState, vUv).r, 0.0, 1.0);
    gl_FragColor = vec4(mix(uColorBg, uColorInk, ink), 1.0);
  }
`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
const dpr = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.Camera();
const quad = new THREE.PlaneGeometry(2, 2);

function makeRT() {
  return new THREE.WebGLRenderTarget(
    window.innerWidth * dpr,
    window.innerHeight * dpr,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    },
  );
}

// carry the same evolving thing forward, changing it a little each time,
// using two hands because you can't hold and reshape the same object simultaneously

// these two work together to display the trail draw by the cursor on the page
let rtA = makeRT();
let rtB = makeRT();

const simScene = new THREE.Scene();
const simMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: simFragment,
  uniforms: {
    uPrev: { value: rtA.texture },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uDecayAmt: { value: 1.0 },
    uBrush: { value: BRUSH },
    uStrength: { value: STRENGTH },
    uActive: { value: 0 },
  },
});
simScene.add(new THREE.Mesh(quad, simMat));

const displayScene = new THREE.Scene();
const displayMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: displayFragment,
  uniforms: {
    uState: { value: rtA.texture },
    uColorBg: { value: COLOR_BG },
    uColorInk: { value: COLOR_INK },
  },
});
displayScene.add(new THREE.Mesh(quad, displayMat));

// pointer tracking
const target = new THREE.Vector2(0.5, 0.5);
const smooth = new THREE.Vector2(0.5, 0.5);
const prev = new THREE.Vector2(0.5, 0.5);
let lastMove = -9999;

window.addEventListener("pointermove", (e) => {
  target.x = e.clientX / window.innerWidth;
  target.y = 1.0 - e.clientY / window.innerHeight;
  lastMove = performance.now();
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  simMat.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  rtA.dispose();
  rtB.dispose();
  rtA = makeRT();
  rtB = makeRT();
});

const OMEGA = 12; // how tightly the ink follows the cursor - lower is laggier and smokier
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const a = Math.exp(-OMEGA * dt);
  prev.copy(smooth);
  smooth.x = target.x + (smooth.x - target.x) * a;
  smooth.y = target.y + (smooth.y - target.y) * a;

  const decayAmt = Math.exp(-DECAY * dt);
  const active = now - lastMove < IDLE_MS ? 1 : 0;

  // write into rtB, then swap so rtA always holds the latest frame
  simMat.uniforms.uPrev.value = rtA.texture;
  simMat.uniforms.uPrevMouse.value.copy(prev);
  simMat.uniforms.uMouse.value.copy(smooth);
  simMat.uniforms.uDecayAmt.value = decayAmt;
  simMat.uniforms.uActive.value = active;
  renderer.setRenderTarget(rtB);
  renderer.render(simScene, camera);
  [rtA, rtB] = [rtB, rtA];

  displayMat.uniforms.uState.value = rtA.texture;
  renderer.setRenderTarget(null);
  renderer.render(displayScene, camera);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
