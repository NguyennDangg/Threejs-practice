// day-25 - GPGPU particles
// Positions live in a float texture, one texel per particle, and are
// advanced by a fragment shader, same ping-pong as 16b, the values are
// coordinates now instead of ink, the CPU never touches a particle

// Overview: day 25 takes the CPU out of the loop entirely - state lives in a texture,
// a shader advances it, and the number of things stops mattering

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Profiler } from "./profiler.js";
import { ProfilerHUD } from "./profiler-hud.js";

const SIZES = [64, 128, 256, 512]; // 4k / 16k / 65k / 262k particles
const SHELL = 26; // radius of the scattered cloud

// The Lance - same curves as day-24, one quality tier, used only as a
// point source: I sample its surface to build the target texture
function strandCurve(phase) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const rad = 0.2 * (1 - t * 0.72);
    const a = phase + t * Math.PI * 4.5;
    pts.push(
      new THREE.Vector3(Math.cos(a) * rad, -4.2 + t * 6.2, Math.sin(a) * rad),
    );
  }
  return new THREE.CatmullRomCurve3(pts);
}
function prongCurve(sign) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(
      new THREE.Vector3(
        sign * Math.sin(t * Math.PI * 0.85) * 0.52,
        2.0 + t * 2.6,
        0,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(pts);
}
function buildLance() {
  const parts = [];
  for (const p of [0, Math.PI])
    parts.push(new THREE.TubeGeometry(strandCurve(p), 160, 0.075, 12, false));
  const up = new THREE.Vector3(0, 1, 0);
  for (const s of [1, -1]) {
    const c = prongCurve(s);
    parts.push(new THREE.TubeGeometry(c, 64, 0.062, 10, false));
    const end = c.getPoint(1),
      tan = c.getTangent(1);
    const cone = new THREE.ConeGeometry(0.062, 0.5, 16);
    cone.translate(0, 0.25, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, tan));
    cone.translate(end.x, end.y, end.z);
    parts.push(cone);
  }
  const tail = new THREE.TorusGeometry(0.3, 0.06, 10, 48);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, -4.1, 0);
  parts.push(tail);
  const collar = new THREE.TorusGeometry(0.22, 0.05, 10, 48);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 1.95, 0);
  parts.push(collar);

  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}
const LANCE = buildLance(); // can be changed to a gltf model

// Random points on the surface, area-weighted so thick parts don't get
// starved. Picking random vertices instead would clump at the seams
function sampleSurface(geo, n, scale) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const triCount = idx.count / 3;

  const areas = new Float32Array(triCount);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, idx.getX(t * 3));
    b.fromBufferAttribute(pos, idx.getX(t * 3 + 1));
    c.fromBufferAttribute(pos, idx.getX(t * 3 + 2));
    areas[t] = total += new THREE.Triangle(a, b, c).getArea();
  }

  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // binary search the cumulative area table
    const r = Math.random() * total;
    let lo = 0,
      hi = triCount - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (areas[m] < r) lo = m + 1;
      else hi = m;
    }

    a.fromBufferAttribute(pos, idx.getX(lo * 3));
    b.fromBufferAttribute(pos, idx.getX(lo * 3 + 1));
    c.fromBufferAttribute(pos, idx.getX(lo * 3 + 2));

    let u = Math.random(),
      v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const o = i * 4;
    out[o] = (a.x + u * (b.x - a.x) + v * (c.x - a.x)) * scale;
    out[o + 1] = (a.y + u * (b.y - a.y) + v * (c.y - a.y)) * scale;
    out[o + 2] = (a.z + u * (b.z - a.z) + v * (c.z - a.z)) * scale;
    out[o + 3] = Math.random(); // per-particle seed, free ride in alpha
  }
  return out;
}

const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const blitFrag = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uSrc;
  void main(){ gl_FragColor = texture2D(uSrc, vUv); }
`;

// Ashima simplex 3D - needed for curl, which is built from its gradients
const simplex3D = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(
      i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`;

// Curl of a noise potential field. Divergence-free by construction, so
// nothing pools or drains - it reads as flow rather than gravity
// Costs 18 snoise calls per particle per frame. This is the expensive part
const curl = `
  vec3 snoiseVec3(vec3 x){
    return vec3(
      snoise(x),
      snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)),
      snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
  }
  vec3 curlNoise(vec3 p){
    const float e = 0.12;
    vec3 dx = vec3(e,0.0,0.0), dy = vec3(0.0,e,0.0), dz = vec3(0.0,0.0,e);
    vec3 px0 = snoiseVec3(p - dx), px1 = snoiseVec3(p + dx);
    vec3 py0 = snoiseVec3(p - dy), py1 = snoiseVec3(p + dy);
    vec3 pz0 = snoiseVec3(p - dz), pz1 = snoiseVec3(p + dz);
    vec3 c = vec3(
      py1.z - py0.z - pz1.y + pz0.y,
      pz1.x - pz0.x - px1.z + px0.z,
      px1.y - px0.y - py1.x + py0.x);
    return normalize(c / (2.0 * e));
  }
`;

// PASS 1 - velocity. Curl flow + spring toward target + damping
const velFrag = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPos, uVel, uTarget;
  uniform float uDt, uTime, uAttract, uCurl, uDamp;
  ${simplex3D}
  ${curl}
  void main(){
    vec3 pos = texture2D(uPos, vUv).xyz;
    vec3 vel = texture2D(uVel, vUv).xyz;
    vec4 tgt = texture2D(uTarget, vUv);
    float seed = tgt.w;

    vec3 flow = curlNoise(pos * 0.055 + vec3(0.0, uTime * 0.06, 0.0));
    vec3 spring = tgt.xyz - pos;

    vel += flow * uCurl * uDt;
    vel += spring * uAttract * uDt * (0.6 + seed * 0.8);

    // Frame-rate independent damping — exp(-k*dt), same as 16b's decay.
    vel *= exp(-uDamp * uDt);

    gl_FragColor = vec4(vel, 1.0);
  }
`;

// PASS 2 — position, plain Euler integration
const posFrag = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPos, uVel;
  uniform float uDt;
  void main(){
    vec3 pos = texture2D(uPos, vUv).xyz;
    vec3 vel = texture2D(uVel, vUv).xyz;
    gl_FragColor = vec4(pos + vel * uDt, 1.0);
  }
`;

// RENDER - each vertex looks up "its" texel and moves there
const pointsVert = `
  precision highp float;
  attribute vec2 aRef;
  uniform sampler2D uPos, uVel;
  uniform float uSize, uPixelRatio;
  varying float vSpeed;
  void main(){
    vec3 p = texture2D(uPos, aRef).xyz;
    vSpeed = length(texture2D(uVel, aRef).xyz);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (30.0 / -mv.z);
  }
`;

const pointsFrag = `
  precision highp float;
  varying float vSpeed;
  uniform vec3 uSlow, uFast;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.0);          // tight bright centre
    // Remapped to the actual speed range — terminal velocity is ~curl/damp.
    vec3 col = mix(uSlow, uFast, smoothstep(0.4, 3.2, vSpeed));
    col += glow * 0.55;                    // whiten the core
    gl_FragColor = vec4(col, core * 0.5 + glow * 0.9);
  }
`;

function initLog25(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const gl = renderer.getContext();
  // RGBA32F is only color-renderable with this extension. Half float costs
  // precision at large coordinates - visible as jitter far from the origin
  const hasFloat = !!gl.getExtension("EXT_color_buffer_float");
  const TYPE = hasFloat ? THREE.FloatType : THREE.HalfFloatType;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050a);
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    400,
  );
  camera.position.set(0, 2, 34);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;

  const simCamera = new THREE.Camera();
  const simScene = new THREE.Scene();
  const quad = new THREE.PlaneGeometry(2, 2);
  const simMesh = new THREE.Mesh(quad, null);
  simScene.add(simMesh);

  const blitMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: blitFrag,
    uniforms: { uSrc: { value: null } },
  });
  const velMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: velFrag,
    uniforms: {
      uPos: { value: null },
      uVel: { value: null },
      uTarget: { value: null },
      uDt: { value: 0 },
      uTime: { value: 0 },
      uAttract: { value: 0 },
      uCurl: { value: 2.5 },
      uDamp: { value: 1.1 },
    },
  });
  const posMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: posFrag,
    uniforms: {
      uPos: { value: null },
      uVel: { value: null },
      uDt: { value: 0 },
    },
  });

  const pointsMat = new THREE.ShaderMaterial({
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    uniforms: {
      uPos: { value: null },
      uVel: { value: null },
      uSize: { value: 2.0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSlow: { value: new THREE.Color(0x8fb4d8) },
      uFast: { value: new THREE.Color(0xff3d1f) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  let size = 256;
  let posA, posB, velA, velB, targetTex, points;

  function makeRT(n) {
    return new THREE.WebGLRenderTarget(n, n, {
      // NEAREST is mandatory: neighbouring texels are unrelated particles,
      // and linear filtering would average their positions together
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: TYPE,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  function blit(srcTexture, dstRT) {
    blitMat.uniforms.uSrc.value = srcTexture;
    simMesh.material = blitMat;
    renderer.setRenderTarget(dstRT);
    renderer.render(simScene, simCamera);
    renderer.setRenderTarget(null);
  }

  function seed() {
    const n = size * size;

    // Initial positions: random shell around the origin
    const p = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = SHELL * (0.55 + Math.random() * 0.45);
      const s = Math.sqrt(1 - u * u);
      p[o] = Math.cos(th) * s * r;
      p[o + 1] = u * r * 0.7;
      p[o + 2] = Math.sin(th) * s * r;
      p[o + 3] = 1;
    }
    const posSeed = new THREE.DataTexture(
      p,
      size,
      size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    posSeed.needsUpdate = true;

    const v = new Float32Array(n * 4);
    const velSeed = new THREE.DataTexture(
      v,
      size,
      size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    velSeed.needsUpdate = true;

    const t = sampleSurface(LANCE, n, 2.2);
    targetTex = new THREE.DataTexture(
      t,
      size,
      size,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    targetTex.minFilter = targetTex.magFilter = THREE.NearestFilter;
    targetTex.needsUpdate = true;

    blit(posSeed, posA);
    blit(posSeed, posB);
    blit(velSeed, velA);
    blit(velSeed, velB);
    posSeed.dispose();
    velSeed.dispose();
  }

  function rebuild(n) {
    if (posA) {
      posA.dispose();
      posB.dispose();
      velA.dispose();
      velB.dispose();
    }
    if (points) {
      scene.remove(points);
      points.geometry.dispose();
    }
    if (targetTex) targetTex.dispose();

    size = n;
    posA = makeRT(n);
    posB = makeRT(n);
    velA = makeRT(n);
    velB = makeRT(n);
    seed();

    // One vertex per texel. Its own position is unused - the only real
    // data is aRef, which says "my state lives at this UV"
    const count = n * n;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    const refs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      refs[i * 2] = ((i % n) + 0.5) / n;
      refs[i * 2 + 1] = (Math.floor(i / n) + 0.5) / n;
    }
    geo.setAttribute("aRef", new THREE.BufferAttribute(refs, 2));

    points = new THREE.Points(geo, pointsMat);
    points.frustumCulled = false; // its bounding sphere would be zero
    scene.add(points);
    panel.sync();
  }

  const state = { form: 0, formTarget: 0, curl: true };
  const profiler = new Profiler(renderer);
  const hud = new ProfilerHUD();

  const el = document.createElement("div");
  el.innerHTML = `
    <style>
      .p25 { position: fixed; bottom: 16px; right: 16px; z-index: 9999;
        font: 10px "JetBrains Mono", ui-monospace, monospace;
        background: rgba(6,6,8,.86); border: 1px solid rgba(193,18,31,.5);
        padding: 10px 12px; color: #e8e8e8; width: 244px; }
      .p25 .lbl { color: #5a5a5a; letter-spacing: .08em; margin-bottom: 6px; }
      .p25 .row { display: flex; gap: 4px; margin-bottom: 10px; }
      .p25 button { flex: 1; background: transparent; color: #5a5a5a;
        border: 1px solid rgba(255,255,255,.12); padding: 5px 0;
        font: inherit; cursor: pointer; }
      .p25 button.on { color: #c1121f; border-color: #c1121f; }
      .p25 .stat { color: #5a5a5a; border-top: 1px solid rgba(255,255,255,.1);
        padding-top: 8px; line-height: 1.6; }
      .p25 .stat b { color: #e8e8e8; font-weight: normal; float: right; }
    </style>
    <div class="p25">
      <div class="lbl">SIM TEXTURE</div><div class="row" data-size></div>
      <div class="lbl">FLOW</div><div class="row" data-tog></div>
      <div class="stat">
        <div>PARTICLES <b data-n>—</b></div>
        <div>PRECISION <b data-prec>—</b></div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const sizeRow = el.querySelector("[data-size]");
  const sizeBtns = SIZES.map((n) => {
    const b = document.createElement("button");
    b.textContent = n;
    b.onclick = () => rebuild(n);
    sizeRow.appendChild(b);
    return b;
  });
  const togRow = el.querySelector("[data-tog]");
  const togBtns = ["FORM", "CURL"].map((t, i) => {
    const b = document.createElement("button");
    b.textContent = t;
    b.onclick = () => {
      if (i === 0) state.formTarget = state.formTarget > 0.5 ? 0 : 1;
      else state.curl = !state.curl;
      panel.sync();
    };
    togRow.appendChild(b);
    return b;
  });

  const panel = {
    sync() {
      sizeBtns.forEach((b, i) => b.classList.toggle("on", SIZES[i] === size));
      togBtns[0].classList.toggle("on", state.formTarget > 0.5);
      togBtns[1].classList.toggle("on", state.curl);
      el.querySelector("[data-n]").textContent = (size * size).toLocaleString();
      el.querySelector("[data-prec]").textContent = hasFloat
        ? "float32"
        : "float16";
    },
  };

  rebuild(size);

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    const i = SIZES.indexOf(Number(e.key) ? SIZES[Number(e.key) - 1] : -1);
    if (e.key >= "1" && e.key <= "4") rebuild(SIZES[Number(e.key) - 1]);
    if (k === "f" || e.code === "Space") {
      state.formTarget = state.formTarget > 0.5 ? 0 : 1;
      panel.sync();
    }
    if (k === "c") {
      state.curl = !state.curl;
      panel.sync();
    }
    if (k === "r") seed();
    if (k === "p") profiler.probe();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    pointsMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  });

  const startTime = performance.now();
  let last = startTime;

  function tick() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 30); // clamp tab-switch spikes
    last = now;
    const t = (now - startTime) / 1000;

    profiler.begin();
    controls.update();

    // Ease the form blend with the same exponential used in 16b
    state.form += (state.formTarget - state.form) * (1 - Math.exp(-2.6 * dt));

    // PASS 1 - velocity, reads posA + velA, writes velB
    velMat.uniforms.uPos.value = posA.texture;
    velMat.uniforms.uVel.value = velA.texture;
    velMat.uniforms.uTarget.value = targetTex;
    velMat.uniforms.uDt.value = dt;
    velMat.uniforms.uTime.value = t;
    velMat.uniforms.uAttract.value = state.form * 7.0;
    velMat.uniforms.uCurl.value = state.curl ? 2.6 - state.form * 2.15 : 0.0;
    velMat.uniforms.uDamp.value = 0.9 + state.form * 2.2;
    simMesh.material = velMat;
    renderer.setRenderTarget(velB);
    renderer.render(simScene, simCamera);
    [velA, velB] = [velB, velA];

    // PASS 2 - position, reads posA + the velocity I just wrote
    posMat.uniforms.uPos.value = posA.texture;
    posMat.uniforms.uVel.value = velA.texture;
    posMat.uniforms.uDt.value = dt;
    simMesh.material = posMat;
    renderer.setRenderTarget(posB);
    renderer.render(simScene, simCamera);
    [posA, posB] = [posB, posA];

    // PASS 3 - draw
    pointsMat.uniforms.uPos.value = posA.texture;
    pointsMat.uniforms.uVel.value = velA.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    profiler.end();
    hud.update(profiler, `GPGPU · ${size}²`);
    requestAnimationFrame(tick);
  }
  tick();
}

const canvas = document.querySelector("canvas.webgl");
initLog25(canvas);
