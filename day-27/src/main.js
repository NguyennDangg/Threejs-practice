// day-27 — shadows
// A shadow map is a depth texture rendered from the light's point of view.
// Shading asks: is anything closer to the light than I am? That's it.

// Two consequences, both measurable in the HUD: it's a second render pass
// (draw calls roughly double), and culling runs against the LIGHT's
// frustum, not the camera's — so objects behind you still get drawn.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Profiler } from "./profiler.js";
import { ProfilerHUD } from "./profiler-hud.js";
import { ContactShadow } from "./contact-shadow.js";

const MODEL = "/assets/porsche_gt3_rs.glb";

const MAP_SIZES = [512, 1024, 2048, 4096];
const TYPES = [
  { label: "BASIC", value: THREE.BasicShadowMap },
  { label: "PCF", value: THREE.PCFShadowMap },
  { label: "SOFT", value: THREE.PCFShadowMap },
  { label: "VSM", value: THREE.VSMShadowMap },
];
// The single biggest lever on shadow quality, and it costs nothing.
const FITS = [
  { label: "TIGHT", extent: 3.4, near: 2, far: 22 },
  { label: "LOOSE", extent: 30, near: 0.5, far: 120 },
];

function initLog27(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0e);
  scene.fog = new THREE.Fog(0x0a0a0e, 22, 60);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(5.2, 2.1, 6.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0.55, 0);
  controls.minDistance = 2.5;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.495; // never go under the floor

  // ---- studio floor -------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({
      color: 0x14141a,
      roughness: 0.82,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- lights -------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(6, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.blurSamples = 12; // VSM only
  scene.add(key);
  scene.add(key.target);

  const fill = new THREE.DirectionalLight(0xc1121f, 1.6);
  fill.position.set(-7, 3, -5);
  scene.add(fill); // deliberately no shadow — compare its cost to key's

  const shadowHelper = new THREE.CameraHelper(key.shadow.camera);
  shadowHelper.visible = false;
  scene.add(shadowHelper);

  const contact = new ContactShadow(renderer, {
    size: 9,
    height: 2.2,
    resolution: 512,
  });
  scene.add(contact.mesh);

  const profiler = new Profiler(renderer);
  const hud = new ProfilerHUD();

  const state = {
    shadows: true,
    mapSize: 2,
    type: 2,
    fit: 0,
    helper: false,
    contact: true,
    bias: 0,
    normalBias: 0.02,
  };

  let car = null;

  // Changing shadowMap.type changes the generated GLSL, so every material
  // needs recompiling. Without this the toggle appears to do nothing.
  function invalidateMaterials() {
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) m.needsUpdate = true;
    });
  }

  function applyShadowSettings() {
    renderer.shadowMap.enabled = state.shadows;
    renderer.shadowMap.type = TYPES[state.type].value;

    const n = MAP_SIZES[state.mapSize];
    if (key.shadow.mapSize.x !== n) {
      key.shadow.mapSize.set(n, n);
      // The existing depth texture is the old size — drop it so three.js
      // allocates a new one. Watch GEO / TEX in the HUD.
      if (key.shadow.map) {
        key.shadow.map.dispose();
        key.shadow.map = null;
      }
    }

    const f = FITS[state.fit];
    const c = key.shadow.camera;
    c.left = -f.extent;
    c.right = f.extent;
    c.top = f.extent;
    c.bottom = -f.extent;
    c.near = f.near;
    c.far = f.far;
    c.updateProjectionMatrix();

    key.shadow.bias = state.bias;
    key.shadow.normalBias = state.normalBias;

    shadowHelper.visible = state.helper;
    shadowHelper.update();
    contact.mesh.visible = state.contact;

    renderer.shadowMap.needsUpdate = true;
    invalidateMaterials();
  }

  // ---- model --------------------------------------------------------
  new GLTFLoader().load(MODEL, (gltf) => {
    const root = gltf.scene;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 4.4 / Math.max(size.x, size.z);
    root.scale.setScalar(s);
    root.position.set(-center.x * s, -box.min.y * s, -center.z * s);

    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true; // the car shadows itself — wings onto body
    });

    car = root;
    scene.add(root);
    applyShadowSettings();
  });

  // ---- panel --------------------------------------------------------
  const el = document.createElement("div");
  el.innerHTML = `
    <style>
      .p27 { position: fixed; bottom: 16px; right: 16px; z-index: 9999;
        font: 10px "JetBrains Mono", ui-monospace, monospace;
        background: rgba(6,6,8,.86); border: 1px solid rgba(193,18,31,.5);
        padding: 10px 12px; color: #e8e8e8; width: 262px; }
      .p27 .lbl { color: #5a5a5a; letter-spacing: .08em; margin-bottom: 6px; }
      .p27 .lbl b { color: #e8e8e8; font-weight: normal; float: right; }
      .p27 .row { display: flex; gap: 4px; margin-bottom: 10px; }
      .p27 button { flex: 1; background: transparent; color: #5a5a5a;
        border: 1px solid rgba(255,255,255,.12); padding: 5px 0;
        font: inherit; cursor: pointer; transition: .15s; }
      .p27 button:hover { color: #e8e8e8; border-color: rgba(255,255,255,.3); }
      .p27 button.on { color: #c1121f; border-color: #c1121f; }
      .p27 input[type=range] { width: 100%; margin-bottom: 10px;
        accent-color: #c1121f; height: 12px; }
      .p27 .keys { color: #3f3f3f; margin-top: 4px; line-height: 1.6; }
    </style>
    <div class="p27">
      <div class="lbl">MAP SIZE <b data-ms></b></div><div class="row" data-map></div>
      <div class="lbl">TYPE</div><div class="row" data-type></div>
      <div class="lbl">SHADOW CAMERA</div><div class="row" data-fit></div>
      <div class="lbl">BIAS <b data-bv></b></div>
      <input type="range" data-bias min="-0.005" max="0.005" step="0.0001" value="0">
      <div class="lbl">NORMAL BIAS <b data-nv></b></div>
      <input type="range" data-nbias min="0" max="0.15" step="0.001" value="0.02">
      <div class="lbl">TOGGLE</div><div class="row" data-tog></div>
      <div class="keys">S SHADOWS · C CONTACT · H HELPER · P PROBE</div>
    </div>`;
  document.body.appendChild(el);

  const mk = (sel, labels, cb) =>
    labels.map((t, i) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = () => cb(i);
      el.querySelector(sel).appendChild(b);
      return b;
    });

  const mapBtns = mk("[data-map]", MAP_SIZES.map(String), (i) => {
    state.mapSize = i;
    sync();
  });
  const typeBtns = mk(
    "[data-type]",
    TYPES.map((t) => t.label),
    (i) => {
      state.type = i;
      sync();
    },
  );
  const fitBtns = mk(
    "[data-fit]",
    FITS.map((f) => f.label),
    (i) => {
      state.fit = i;
      sync();
    },
  );
  const togBtns = mk("[data-tog]", ["SHADOWS", "CONTACT", "HELPER"], (i) => {
    if (i === 0) state.shadows = !state.shadows;
    if (i === 1) state.contact = !state.contact;
    if (i === 2) state.helper = !state.helper;
    sync();
  });

  const biasEl = el.querySelector("[data-bias]");
  const nbiasEl = el.querySelector("[data-nbias]");
  biasEl.oninput = () => {
    state.bias = Number(biasEl.value);
    sync();
  };
  nbiasEl.oninput = () => {
    state.normalBias = Number(nbiasEl.value);
    sync();
  };

  function sync() {
    mapBtns.forEach((b, i) => b.classList.toggle("on", i === state.mapSize));
    typeBtns.forEach((b, i) => b.classList.toggle("on", i === state.type));
    fitBtns.forEach((b, i) => b.classList.toggle("on", i === state.fit));
    const flags = [state.shadows, state.contact, state.helper];
    togBtns.forEach((b, i) => b.classList.toggle("on", flags[i]));
    el.querySelector("[data-ms]").textContent = `${MAP_SIZES[state.mapSize]}²`;
    el.querySelector("[data-bv]").textContent = state.bias.toFixed(4);
    el.querySelector("[data-nv]").textContent = state.normalBias.toFixed(3);
    applyShadowSettings();
  }
  sync();

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "s") {
      state.shadows = !state.shadows;
      sync();
    }
    if (k === "c") {
      state.contact = !state.contact;
      sync();
    }
    if (k === "h") {
      state.helper = !state.helper;
      sync();
    }
    if (k === "p") profiler.probe();
    if (e.key >= "1" && e.key <= "4") {
      state.mapSize = Number(e.key) - 1;
      sync();
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  const startTime = performance.now();

  function tick() {
    const t = (performance.now() - startTime) / 1000;

    profiler.begin();
    controls.update();

    // Slow orbit on the key light so the shadow is never static — a
    // still shadow hides most of the artifacts you're here to see.
    key.position.set(Math.cos(t * 0.12) * 8, 9, Math.sin(t * 0.12) * 8);
    key.shadow.camera.updateProjectionMatrix();
    if (state.helper) shadowHelper.update();

    // Contact shadow is its own render pass — it lands in the same
    // draw-call total, which is the honest accounting.
    if (state.contact && car) contact.update(scene, car, [floor, shadowHelper]);

    renderer.render(scene, camera);
    profiler.end();

    hud.update(
      profiler,
      `${state.shadows ? TYPES[state.type].label : "OFF"} · ${MAP_SIZES[state.mapSize]}`,
    );
    requestAnimationFrame(tick);
  }
  tick();
}

const canvas = document.querySelector("canvas.webgl");
if (!canvas)
  throw new Error("No canvas.webgl in the document — check index.html");
initLog27(canvas);
