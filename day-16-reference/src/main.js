import "./style.css";
import * as THREE from "three";

// Shared vertex shader for fullscreen quads
const fullscreenVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Shared simplex 2D noise (Ashima/webgl-noise, MIT license)
const simplex2D = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                             + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

// A_FLUID fragment shader
const fluidFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uRes;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  ${simplex2D}

  float fbm(vec2 p){
    float total = 0.0;
    float amp = 0.5;
    for(int i = 0; i < 5; i++){
      total += snoise(p) * amp;
      p *= 2.0;
      amp *= 0.5;
    }
    return total;
  }

  void main(){
    vec2 uv = vUv;
    uv = (uv - 0.5);
    uv.x *= uRes.x / uRes.y;

    float t = uTime * 0.08;

    float pd = distance(uv, uPointer);
    vec2 push = (uv - uPointer) * exp(-pd * 3.0) * 0.6;

    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(uv + q + push), fbm(uv + q + vec2(8.3, 2.8)));

    float v = fbm(uv + r);
    v = v * 0.5 + 0.5;

    vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.75, v));
    col += (r.x) * 0.06;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// B_WARP fragment shader
const warpFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uRes;
  uniform vec3 uColorBg;
  uniform vec3 uColorLine;
  ${simplex2D}

  void main(){
    vec2 uv = vUv;
    uv.x *= uRes.x / uRes.y;

    float t = uTime * 0.05;

    vec2 warp = vec2(
      snoise(uv * 2.0 + t),
      snoise(uv * 2.0 - t + 10.0)
    );
    warp += uPointer * 0.8;

    float n = snoise(uv * 3.0 + warp);
    n = n * 0.5 + 0.5;

    float bands = n * 8.0;
    float f = fract(bands);
    float edge = min(f, 1.0 - f);
    float line = smoothstep(0.06, 0.0, edge);

    vec3 col = mix(uColorBg, uColorLine, line);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const C = (hex) => new THREE.Color(hex);

// Generic fullscreen shader canvas
function createShaderCanvas(mount, fragmentShader, uniformsInit) {
  const w = mount.clientWidth;
  const h = mount.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  mount.appendChild(renderer.domElement);

  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uRes: { value: new THREE.Vector2(w * dpr, h * dpr) },
    ...uniformsInit(),
  };

  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader,
    uniforms,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const target = new THREE.Vector2(0, 0);
  const smooth = new THREE.Vector2(0, 0);
  const OMEGA = 5;

  function onMove(e) {
    const rect = mount.getBoundingClientRect();
    target.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    target.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }
  mount.addEventListener("pointermove", onMove);

  let last = performance.now();
  let rafId;

  function raf(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const a = Math.exp(-OMEGA * dt);
    smooth.x = target.x + (smooth.x - target.x) * a;
    smooth.y = target.y + (smooth.y - target.y) * a;

    uniforms.uTime.value = now * 0.001;
    uniforms.uPointer.value.copy(smooth);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(raf);
  }
  raf(last);

  // returns a cleanup function - call this before switching tabs
  return () => {
    cancelAnimationFrame(rafId);
    mount.removeEventListener("pointermove", onMove);
    geo.dispose();
    mat.dispose();
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };
}

// HOP type effect
function power3Out(t) {
  return 1 - Math.pow(1 - t, 3);
}

function createHopType(mount, word = "SCENARIO") {
  const width = mount.clientWidth;
  const height = mount.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);

  const chars = word.split("");
  const cellSize = 1.6 / chars.length;
  const meshes = [];

  function makeCharTexture(char) {
    const canvas = document.createElement("canvas");
    const res = 256;
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, res, res);
    ctx.fillStyle = "#f4f1ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${res * 0.62}px 'Space Mono', monospace`;
    ctx.fillText(char, res / 2, res / 2 + res * 0.04);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  chars.forEach((char, i) => {
    const geo = new THREE.PlaneGeometry(cellSize * 0.86, cellSize * 0.86);
    const tex = makeCharTexture(char);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = -0.8 + cellSize * i + cellSize / 2;
    mesh.userData.hop = { height: 0 };
    mesh.userData.anim = null;
    mesh.userData.baseY = 0;
    meshes.push(mesh);
    scene.add(mesh);
  });

  function hop(mesh, delay = 0) {
    const state = mesh.userData.hop;
    if (mesh.userData.anim) return;

    const duration = 380;
    const start = performance.now() + delay;
    mesh.userData.anim = "running";

    function tick(now) {
      const t = now - start;
      if (t < 0) {
        requestAnimationFrame(tick);
        return;
      }
      const half = duration;
      if (t < half) {
        state.height = power3Out(t / half);
      } else if (t < half * 2) {
        state.height = 1 - power3Out((t - half) / half);
      } else {
        state.height = 0;
        mesh.userData.anim = null;
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2(-10, -10);

  function onPointerMove(e) {
    const rect = mount.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  mount.addEventListener("pointermove", onPointerMove);

  let lastHoverIndex = -1;
  let rafId;

  function raf() {
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(meshes);

    if (hits.length) {
      const idx = meshes.indexOf(hits[0].object);
      if (idx !== lastHoverIndex) {
        lastHoverIndex = idx;
        meshes.forEach((m, i) => {
          const dist = Math.abs(i - idx);
          if (dist <= 2) hop(m, dist * 45);
        });
      }
    } else {
      lastHoverIndex = -1;
    }

    meshes.forEach((mesh) => {
      const h = mesh.userData.hop.height;
      mesh.position.y = mesh.userData.baseY + Math.pow(h, 1.6) * 0.35;
      mesh.scale.setScalar(1 + h * 0.15);
    });

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(raf);
  }
  raf();

  return () => {
    cancelAnimationFrame(rafId);
    mount.removeEventListener("pointermove", onPointerMove);
    meshes.forEach((m) => {
      m.geometry.dispose();
      m.material.map.dispose();
      m.material.dispose();
    });
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };
}

// NOISE type effect
const noiseVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const noiseFrag = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec2 uPointer;
  varying vec2 vUv;

  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);
    const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(
      i.z+vec4(0.0,i1.z,i2.z,1.0))
      +i.y+vec4(0.0,i1.y,i2.y,1.0))
      +i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;
    vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;
    return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main(){
    vec2 uv = vUv;
    float div = 28.0;
    float nx = ceil(uv.x * div) / div;
    float ny = ceil(uv.y * div) / div;
    float n = (1.0 + snoise(vec3(nx * 3.0, ny * 3.0, uTime * 0.12))) * 0.5;

    uv.x += n * uPointer.x * 0.4;
    uv.y += n * uPointer.y * 0.4;

    vec4 color = texture2D(uTexture, uv);
    gl_FragColor = color;
  }
`;

function createNoiseType(mount, text = "NG-2026") {
  const width = mount.clientWidth;
  const height = mount.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mount.appendChild(renderer.domElement);

  const canvas = document.createElement("canvas");
  const res = 1024;
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, res, res);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#c1121f";
  ctx.font = `700 ${res * 0.13}px 'Space Mono', monospace`;
  ctx.fillText(text, res / 2, res / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const uniforms = {
    uTexture: { value: texture },
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
  };

  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: noiseVert,
    fragmentShader: noiseFrag,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  const target = { x: 0, y: 0 };
  const smooth = { x: 0, y: 0 };
  const OMEGA = 6;

  function onPointerMove(e) {
    const rect = mount.getBoundingClientRect();
    target.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    target.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }
  mount.addEventListener("pointermove", onPointerMove);

  let last = performance.now();
  let rafId;

  function raf(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const alpha = Math.exp(-OMEGA * dt);
    smooth.x = target.x + (smooth.x - target.x) * alpha;
    smooth.y = target.y + (smooth.y - target.y) * alpha;

    uniforms.uTime.value = now * 0.001;
    uniforms.uPointer.value.set(smooth.x, smooth.y);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(raf);
  }
  raf(last);

  return () => {
    cancelAnimationFrame(rafId);
    mount.removeEventListener("pointermove", onPointerMove);
    geo.dispose();
    mat.dispose();
    texture.dispose();
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };
}

// scatter effect - velocity field fluid (studied from yutaabe.com)
// two-pass: a sim pass evolves a velocity field (diffuse + advect +
// mouse inject), a display pass reads it. Unlike the other tabs this
// owns render targets, so cleanup disposes them too
function createFluidCanvas(mount) {
  const width = mount.clientWidth;
  const height = mount.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height);
  mount.appendChild(renderer.domElement);

  const quad = new THREE.PlaneGeometry(2, 2);

  const SIM = 256;
  let simW = SIM;
  let simH = Math.round(SIM * (height / width));
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

  const fluidFrag = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uPrev;
    uniform vec2 uMouse, uMousePrev;
    uniform float uRadius, uPush, uDecay;
    void main(){
      vec2 uv = vUv;
      float b = 0.009;
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
      vec2 upstream = clamp(uv - vel * 0.03, 0.0, 1.0);
      vel = mix(vel, texture2D(uPrev, upstream).rg, 0.7);
      vel *= uDecay;
      vec2 mouseUv = uMouse * 0.5 + 0.5;
      vec2 mouseDelta = (uMouse - uMousePrev) * uPush;
      float influence = smoothstep(uRadius, 0.0, distance(uv, mouseUv));
      vel += mouseDelta * influence;
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }
  `;

  const fluidDisplayFrag = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uState;
    uniform vec3 uColorBg, uColorInk;
    void main(){
      vec2 vel = texture2D(uState, vUv).rg;
      float strength = length(vel);
      vec3 col = mix(uColorBg, uColorInk, smoothstep(0.0, 0.15, strength));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const simScene = new THREE.Scene();
  const simMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: fluidFrag,
    uniforms: {
      uPrev: { value: rtA.texture },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uMousePrev: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 0.12 },
      uPush: { value: 6.0 },
      uDecay: { value: 0.985 },
    },
  });
  simScene.add(new THREE.Mesh(quad, simMat));

  const dispMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: fluidDisplayFrag,
    uniforms: {
      uState: { value: rtA.texture },
      uColorBg: { value: C("#0a0a0a") },
      uColorInk: { value: C("#c1121f") },
    },
  });
  scene.add(new THREE.Mesh(quad, dispMat));

  const target = new THREE.Vector2(0, 0);
  const smooth = new THREE.Vector2(0, 0);
  const prev = new THREE.Vector2(0, 0);
  const OMEGA = 14;

  function onMove(e) {
    const rect = mount.getBoundingClientRect();
    target.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    target.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }
  mount.addEventListener("pointermove", onMove);

  let last = performance.now();
  let rafId;
  function raf(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const a = Math.exp(-OMEGA * dt);
    prev.copy(smooth);
    smooth.x = target.x + (smooth.x - target.x) * a;
    smooth.y = target.y + (smooth.y - target.y) * a;

    simMat.uniforms.uPrev.value = rtA.texture;
    simMat.uniforms.uMousePrev.value.copy(prev);
    simMat.uniforms.uMouse.value.copy(smooth);
    renderer.setRenderTarget(rtB);
    renderer.render(simScene, camera);
    [rtA, rtB] = [rtB, rtA];

    dispMat.uniforms.uState.value = rtA.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    rafId = requestAnimationFrame(raf);
  }
  raf(last);

  return () => {
    cancelAnimationFrame(rafId);
    mount.removeEventListener("pointermove", onMove);
    quad.dispose();
    simMat.dispose();
    dispMat.dispose();
    rtA.dispose();
    rtB.dispose();
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };
}

// Tab controller
const descriptions = {
  fluid:
    "fbm stacks 5 noise octaves; two fbm samples fold the coordinate space into a flow; move the pointer to push the field.",
  warp: "one noise sample warps the input of a second (domain warp); fract() slices it into 8 bands; smoothstep draws thin contour lines.",
  hop: "hover across the letters — each char is its own mesh, position/scale driven by a plain state object, tweened by hand-rolled power3.out.",
  noise:
    "move the pointer over the panel — one mesh, fragment shader displaces the UV lookup using simplex noise scaled by time + smoothed pointer position.",
  scatter:
    "move the pointer — a velocity field diffuses + advects like liquid; the buffer stores motion (not ink), so ripples spread and settle. studied from yutaabe.com.",
};

const mount = document.getElementById("lab-canvas-mount");
const descEl = document.getElementById("lab-desc");
const tabs = document.querySelectorAll(".lab-tab");

let currentCleanup = null;

function switchTab(tabId) {
  if (currentCleanup) currentCleanup();
  mount.innerHTML = "";

  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
  descEl.textContent = descriptions[tabId];

  if (tabId === "fluid") {
    currentCleanup = createShaderCanvas(mount, fluidFragment, () => ({
      uColorA: { value: C("#0a0a0a") },
      uColorB: { value: C("#c1121f") },
    }));
  } else if (tabId === "warp") {
    currentCleanup = createShaderCanvas(mount, warpFragment, () => ({
      uColorBg: { value: C("#0a0a0a") },
      uColorLine: { value: C("#c1121f") },
    }));
  } else if (tabId === "hop") {
    currentCleanup = createHopType(mount, "SCENARIO");
  } else if (tabId === "noise") {
    currentCleanup = createNoiseType(mount, "NG-2026");
  } else if (tabId === "scatter") {
    currentCleanup = createFluidCanvas(mount);
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

switchTab("fluid");