import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Profiler } from "./profiler.js";
import { ProfilerHUD } from "./profiler-hud.js";

const MAX_COUNT = 30000;
const SPREAD = 26;
const STEPS = [500, 2000, 6000, 12000, 20000, 30000];

// Seeds for the maximum are generated once; each stage reads the first
// `count` of them, so changing count never reshuffles the layout.
const seeds = new Float32Array(MAX_COUNT * 5); // x, y, z, scale, phase
for (let i = 0; i < MAX_COUNT; i++) {
  const o = i * 5;
  seeds[o] = (Math.random() - 0.5) * SPREAD;
  seeds[o + 1] = (Math.random() - 0.5) * SPREAD * 0.55;
  seeds[o + 2] = (Math.random() - 0.5) * SPREAD;
  seeds[o + 3] = 0.25 + Math.random() * 0.45;
  seeds[o + 4] = Math.random() * Math.PI * 2;
}

const BASE = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D(); // reused - never allocate in the loop
const MAT_OPTS = { color: 0xb8b8bd, roughness: 0.55 };

// STAGE 0 — one mesh + one material per cube.
// PROGRAMS stays at 1: three.js caches shader programs by parameter
// signature, not by material instance. What you pay for is one draw
// call, one material state change and one uniform upload per cube.
// Extra credit: give every 10th material `flatShading: true` and watch
// PROGRAMS go 1 → 2. That's what actually forks a shader.
function stageUniqueMaterials(count) {
  const group = new THREE.Group();
  const meshes = [];
  for (let i = 0; i < count; i++) {
    const o = i * 5;
    const mat = new THREE.MeshStandardMaterial(MAT_OPTS);
    const mesh = new THREE.Mesh(BASE, mat);
    mesh.position.set(seeds[o], seeds[o + 1], seeds[o + 2]);
    mesh.scale.setScalar(seeds[o + 3]);
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    object: group,
    label: "UNIQUE MAT",
    update(t) {
      for (let i = 0; i < count; i++) {
        meshes[i].rotation.y = t * 0.5 + seeds[i * 5 + 4];
      }
    },
    dispose() {
      meshes.forEach((m) => m.material.dispose());
    },
  };
}

// STAGE 1 - one shared material. Same draw calls, fewer state changes
// Sharing materials is free and always correct - but it is not what
// fixes draw calls
function stageSharedMaterial(count) {
  const mat = new THREE.MeshStandardMaterial(MAT_OPTS);
  const group = new THREE.Group();
  const meshes = [];
  for (let i = 0; i < count; i++) {
    const o = i * 5;
    const mesh = new THREE.Mesh(BASE, mat);
    mesh.position.set(seeds[o], seeds[o + 1], seeds[o + 2]);
    mesh.scale.setScalar(seeds[o + 3]);
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    object: group,
    label: "SHARED MAT",
    update(t) {
      for (let i = 0; i < count; i++) {
        meshes[i].rotation.y = t * 0.5 + seeds[i * 5 + 4];
      }
    },
    dispose() {
      mat.dispose();
    },
  };
}

// STAGE 2 - merged into one geometry, 1 draw call, but the cubes are
// welded together: no per-cube transform, no per-cube culling
// Note update() - it can only spin the whole block
function stageMerged(count) {
  const parts = [];
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const o = i * 5;
    const g = BASE.clone();
    m.makeRotationY(seeds[o + 4]);
    m.scale(s.setScalar(seeds[o + 3]));
    m.setPosition(seeds[o], seeds[o + 1], seeds[o + 2]);
    g.applyMatrix4(m);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());

  const mat = new THREE.MeshStandardMaterial(MAT_OPTS);
  const mesh = new THREE.Mesh(merged, mat);

  return {
    object: mesh,
    label: "MERGED",
    update(t) {
      mesh.rotation.y = t * 0.08;
    }, // whole block only
    dispose() {
      merged.dispose();
      mat.dispose();
    },
  };
}

// STAGE 3 - InstancedMesh, 1 draw call AND per-cube transforms back
// The CPU cost moves from N draw submissions to N matrix writes into a
// single buffer. Push the count up and watch which one scales better
function stageInstanced(count) {
  const mat = new THREE.MeshStandardMaterial(MAT_OPTS);
  const mesh = new THREE.InstancedMesh(BASE, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  return {
    object: mesh,
    label: "INSTANCED",
    update(t) {
      for (let i = 0; i < count; i++) {
        const o = i * 5;
        dummy.position.set(seeds[o], seeds[o + 1], seeds[o + 2]);
        dummy.scale.setScalar(seeds[o + 3]);
        dummy.rotation.y = t * 0.5 + seeds[o + 4];
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      mesh.dispose();
      mat.dispose();
    },
  };
}

const STAGES = [
  stageUniqueMaterials,
  stageSharedMaterial,
  stageMerged,
  stageInstanced,
];
const STAGE_NAMES = ["UNIQUE MAT", "SHARED MAT", "MERGED", "INSTANCED"];

// Control panel - plain DOM. Kept out of the WebGL canvas on purpose:
// an in-scene HUD would add draw calls and fill cost to the very frame
// it's trying to measure
function buildPanel({ onStage, onCount, onProbe }) {
  const el = document.createElement("div");
  el.innerHTML = `
    <style>
      .p23 { position: fixed; bottom: 16px; right: 16px; z-index: 9999;
        font: 10px "JetBrains Mono", ui-monospace, monospace;
        background: rgba(6,6,8,.86); border: 1px solid rgba(193,18,31,.5);
        padding: 10px 12px; color: #e8e8e8; width: 244px; }
      .p23 .lbl { color: #5a5a5a; letter-spacing: .08em; margin-bottom: 6px; }
      .p23 .row { display: flex; gap: 4px; margin-bottom: 10px; }
      .p23 button { flex: 1; background: transparent; color: #5a5a5a;
        border: 1px solid rgba(255,255,255,.12); padding: 5px 0;
        font: inherit; cursor: pointer; transition: .15s; }
      .p23 button:hover { color: #e8e8e8; border-color: rgba(255,255,255,.3); }
      .p23 button.on { color: #c1121f; border-color: #c1121f; }
      .p23 .wide { width: 100%; margin-top: 2px; }
      .p23 .cnt { color: #e8e8e8; float: right; }
    </style>
    <div class="p23">
      <div class="lbl">STAGE</div>
      <div class="row" data-stages></div>
      <div class="lbl">COUNT <span class="cnt" data-count></span></div>
      <div class="row" data-counts></div>
      <button class="wide" data-probe>RUN BOUND PROBE  [P]</button>
    </div>`;
  document.body.appendChild(el);

  const stageRow = el.querySelector("[data-stages]");
  const countRow = el.querySelector("[data-counts]");
  const countOut = el.querySelector("[data-count]");

  STAGE_NAMES.forEach((_, i) => {
    const b = document.createElement("button");
    b.textContent = i + 1;
    b.onclick = () => onStage(i);
    stageRow.appendChild(b);
  });
  STEPS.forEach((n) => {
    const b = document.createElement("button");
    b.textContent = n >= 1000 ? `${n / 1000}k` : n;
    b.onclick = () => onCount(n);
    countRow.appendChild(b);
  });
  el.querySelector("[data-probe]").onclick = onProbe;

  return {
    sync(stageIndex, count) {
      [...stageRow.children].forEach((b, i) =>
        b.classList.toggle("on", i === stageIndex),
      );
      [...countRow.children].forEach((b, i) =>
        b.classList.toggle("on", STEPS[i] === count),
      );
      countOut.textContent = count.toLocaleString();
    },
  };
}

function initLog23(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.Fog(0x07070a, 22, 52);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );
  camera.position.set(0, 6, 30);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 90;

  // Auto-orbit until the first touch
  let autoOrbit = true;
  controls.addEventListener("start", () => {
    autoOrbit = false;
  });

  scene.add(new THREE.AmbientLight(0x404050, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(6, 10, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc1121f, 1.4);
  rim.position.set(-8, -2, -6);
  scene.add(rim);

  const profiler = new Profiler(renderer);
  const hud = new ProfilerHUD();

  let current = null;
  let stageIndex = 0;
  let count = 2000;

  function rebuild() {
    if (current) {
      scene.remove(current.object);
      current.dispose(); // watch GEO/TEX in the HUD - it should not climb
    }
    current = STAGES[stageIndex](count);
    scene.add(current.object);
    panel.sync(stageIndex, count);
  }

  const panel = buildPanel({
    onStage: (i) => {
      stageIndex = i;
      rebuild();
    },
    onCount: (n) => {
      count = n;
      rebuild();
    },
    onProbe: () => profiler.probe(),
  });

  rebuild();

  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "4") {
      stageIndex = Number(e.key) - 1;
      rebuild();
    }
    if (e.key.toLowerCase() === "p") profiler.probe();
    if (e.key.toLowerCase() === "o") autoOrbit = !autoOrbit;
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  // Elapsed time without THREE.Clock - performance.now() is browser-native
  // and returns ms since page load as a high-precision float
  const startTime = performance.now();

  function tick() {
    const t = (performance.now() - startTime) / 1000; // seconds

    profiler.begin();

    current.update(t);
    if (autoOrbit) {
      camera.position.x = Math.sin(t * 0.12) * 30;
      camera.position.z = Math.cos(t * 0.12) * 30;
      camera.lookAt(0, 0, 0);
    } else {
      controls.update();
    }
    renderer.render(scene, camera);

    profiler.end();

    hud.update(profiler, `${current.label} · ${count.toLocaleString()}`);
    requestAnimationFrame(tick);
  }
  tick();
}

initLog23(document.querySelector("canvas.webgl"));
