// day 16e - capstone: animated field + cursor wipe + halftone dots
// Combines: 16a's live animated field, 16b's wipe-and-heal ink buffer
// (used here as a MASK instead of paint), and a halftone dot render
// instead of flat grid squares - brightness controls DOT SIZE, not
// just color, same principle newspapers used for black & white photos

import * as THREE from "three";

const CELL = 14;
const DECAY = 0.9;
const BRUSH = 0.06;
const STRENGTH = 1.0;
const IDLE_MS = 100;
const PERIOD = 6.0;
const DRIFT = 0.08;

const COLOR_BG = new THREE.Color(0x14171c); // lighter charcoal, not near-black
const COLOR_LOW = new THREE.Color(0x1f242b); // dim dot color
const COLOR_HIGH = new THREE.Color(0x9fb6c4); // bright dot color, cool grey-blue

const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const simplex2D = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m; m=m*m;
    vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5;
    vec3 ox=floor(x+0.5); vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  vec2  hash2(float n){ return fract(sin(vec2(n, n+1.0)) * vec2(43758.5453, 22578.1459)) * 100.0; }
`;

// sim pass - cursor wipes the buffer, decay heals it back (from 16b)
const simFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uMouse, uPrevMouse;
  uniform float uAspect, uDecay, uBrush, uStrength, uActive;
  float segDist(vec2 p, vec2 a, vec2 b){
    vec2 pa=p-a, ba=b-a;
    float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
    return length(pa-ba*h);
  }
  void main(){
    float prev = texture2D(uPrev, vUv).r * uDecay;
    vec2 p=vec2(vUv.x*uAspect,vUv.y), m=vec2(uMouse.x*uAspect,uMouse.y), pm=vec2(uPrevMouse.x*uAspect,uPrevMouse.y);
    float d = segDist(p, pm, m);
    float add = smoothstep(uBrush,0.0,d) * uStrength * uActive;
    gl_FragColor = vec4(max(prev, add), 0.0, 0.0, 1.0);
  }
`;

// display pass - animated field, masked by the wipe buffer, drawn as halftone dots
const displayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uGridRes;
  uniform float uTime, uPeriod, uDrift, uIntro;
  uniform vec3 uBg, uLow, uHigh;
  ${simplex2D}

  float sampleField(vec2 cell, vec2 seedOff){
    float n = snoise(cell * 0.09 + seedOff + uTime * uDrift) * 0.5 + 0.5;
    float tw = hash(cell + floor(uTime * 1.5)) * 0.4;
    return smoothstep(0.4, 0.75, n) + tw * 0.3;
  }

  void main(){
    vec2 cell = floor(vUv * uGridRes);

    // auto-changing field, crossfading between two noise seeds (from 16d/16e)
    float phase = uTime / uPeriod;
    float seedA = floor(phase);
    float blend = smoothstep(0.85, 1.0, fract(phase));
    float fA = sampleField(cell, hash2(seedA));
    float fB = sampleField(cell, hash2(seedA + 1.0));
    float field = clamp(mix(fA, fB, blend), 0.0, 1.0);

    // wipe mask — cursor erases the field, decay heals it back
    float ink = clamp(texture2D(uState, vUv).r, 0.0, 1.0);
    float mask = (1.0 - ink) * uIntro;

    // halftone dot render
    // fract() gives this pixel's LOCAL position within its own cell (0..1),
    // fresh every cell - same idea as your Day 09 sector segmentation,
    // just used here to draw a shape instead of a color band
    vec2 cellUv = fract(vUv * uGridRes);
    vec2 centered = cellUv - 0.5;
    float distFromCenter = length(centered);

    // brightness controls DOT SIZE, not just color — the actual halftone trick
    float dotRadius = field * mask * 0.48;
    float dot = smoothstep(dotRadius, dotRadius - 0.06, distFromCenter);

    vec3 fieldCol = mix(uLow, uHigh, field);
    vec3 col = mix(uBg, fieldCol, dot);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const renderer = new THREE.WebGLRenderer({ antialias: false });
const dpr = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.Camera();
const quad = new THREE.PlaneGeometry(2, 2);

let gridW, gridH;
function gridSize() {
  gridW = Math.max(2, Math.round((window.innerWidth * dpr) / CELL));
  gridH = Math.max(2, Math.round((window.innerHeight * dpr) / CELL));
}
gridSize();

function makeRT() {
  return new THREE.WebGLRenderTarget(gridW, gridH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
}
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
    uDecay: { value: DECAY },
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
    uGridRes: { value: new THREE.Vector2(gridW, gridH) },
    uTime: { value: 0 },
    uPeriod: { value: PERIOD },
    uDrift: { value: DRIFT },
    uIntro: { value: 0 },
    uBg: { value: COLOR_BG },
    uLow: { value: COLOR_LOW },
    uHigh: { value: COLOR_HIGH },
  },
});
displayScene.add(new THREE.Mesh(quad, displayMat));

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
  gridSize();
  rtA.dispose();
  rtB.dispose();
  rtA = makeRT();
  rtB = makeRT();
  displayMat.uniforms.uGridRes.value.set(gridW, gridH);
});

const OMEGA = 12;
let last = performance.now();
const start = last;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const a = Math.exp(-OMEGA * dt);
  prev.copy(smooth);
  smooth.x = target.x + (smooth.x - target.x) * a;
  smooth.y = target.y + (smooth.y - target.y) * a;
  const active = now - lastMove < IDLE_MS ? 1 : 0;

  simMat.uniforms.uPrev.value = rtA.texture;
  simMat.uniforms.uPrevMouse.value.copy(prev);
  simMat.uniforms.uMouse.value.copy(smooth);
  simMat.uniforms.uActive.value = active;
  renderer.setRenderTarget(rtB);
  renderer.render(simScene, camera);
  [rtA, rtB] = [rtB, rtA];

  const t = (now - start) * 0.001;

  // intro/outro cycle: black hold, fade in, show, fade out then repeat
  const HOLD = 4.0; // black at the start of each cycle (seconds)
  const FADE = 2.0; // fade duration (both in and out)
  const SHOW = 6.0; // how long the field stays fully visible
  const CYCLE = HOLD + FADE + SHOW + FADE;
  const c = t % CYCLE; // where we are in the current cycle

  let intro;
  if (c < HOLD)
    intro = 0.0; // black
  else if (c < HOLD + FADE)
    intro = (c - HOLD) / FADE; // fade in
  else if (c < HOLD + FADE + SHOW)
    intro = 1.0; // fully shown
  else intro = 1.0 - (c - HOLD - FADE - SHOW) / FADE; // fade out
  intro = intro * intro * (3.0 - 2.0 * intro); // ease both directions

  displayMat.uniforms.uState.value = rtA.texture;
  displayMat.uniforms.uTime.value = t;
  displayMat.uniforms.uIntro.value = intro;
  renderer.setRenderTarget(null);
  renderer.render(displayScene, camera);

  requestAnimationFrame(frame);
}
// pass a real timestamp on the first manual call - same fix as 16d
frame(performance.now());
