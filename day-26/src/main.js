// day 26 — load strategy
// Everything before the first frame: bytes over the wire, parse time,
// shader compilation, and the gap between file size and GPU memory

// day 26 measures the seconds before the first frame - and the gap between what a file weighs and what it costs
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Profiler } from "./profiler.js";
import { ProfilerHUD } from "./profiler-hud.js";
import { LoadTimeline } from "./timeline.js";
import { LoaderOverlay } from "./loader.js";
import {
  loadModel,
  estimateVram,
  capTextures,
  disposeModel,
} from "./asset-lab.js";

const SOURCES = [
  { key: "ZR1", url: "/assets/corvette_zr1.glb" },
  { key: "911", url: "/assets/porsche_911_gt3.glb" },
  { key: "MERC", url: "/assets/mercedes_gt3.glb" },
];

const CAPS = [
  { label: "FULL", size: Infinity },
  { label: "2048", size: 2048 },
  { label: "1024", size: 1024 },
  { label: "512", size: 512 },
];

const THROTTLES = [
  { label: "OFF", bps: 0 },
  { label: "10MB", bps: 1e7 },
  { label: "3MB", bps: 3e6 },
  { label: "800K", bps: 8e5 },
];

const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

function initLog26(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080c);

  // PMREM adds one texture you didn't load - worth knowing before you read
  // GEO / TEX and think something leaked
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(4.6, 1.9, 6.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0.5, 0);
  controls.minDistance = 2;
  controls.maxDistance = 24;

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(5, 8, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc1121f, 2.2);
  rim.position.set(-6, 2, -5);
  scene.add(rim);

  const profiler = new Profiler(renderer);
  const hud = new ProfilerHUD();
  const timeline = new LoadTimeline();
  const overlay = new LoaderOverlay();

  const state = {
    source: 0,
    cap: 0,
    throttle: 0,
    precompile: true,
    busy: false,
  };
  const ledger = new Map(); // "KEY·CAP" -> row
  let current = null; // { root, fit, bytes }
  let spans = [];
  let marks = [];

  // Normalise to a known footprint. Model authors agree on nothing
  function place(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 4.4 / Math.max(size.x, size.z);
    root.scale.setScalar(s);
    root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    return s;
  }

  function report() {
    if (!current) return;
    const v = estimateVram(current.root);
    const biggest = v.sizes.length
      ? v.sizes.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0]
      : null;
    const tris = Math.round(v.tris);

    timeline.render(spans, marks, [
      ["TRANSFERRED", mb(current.bytes)],
      ["VRAM · TEXTURES", mb(v.texBytes)],
      ["VRAM · GEOMETRY", mb(v.geoBytes)],
      [
        "TEXTURES / LARGEST",
        `${v.texCount} · ${biggest ? `${biggest.w}×${biggest.h}` : "—"}`,
      ],
      ["TRIANGLES", tris.toLocaleString()],
    ]);

    const src = SOURCES[state.source];
    const cap = CAPS[state.cap];
    ledger.set(`${src.key}·${cap.label}`, {
      key: src.key,
      cap: cap.label,
      wire: mb(current.bytes),
      vram: mb(v.texBytes + v.geoBytes),
      tris: tris.toLocaleString(),
    });
    timeline.renderLedger([...ledger.values()]);
  }

  function clear() {
    if (!current) return;
    scene.remove(current.root);
    disposeModel(current.root); // GEO / TEX in the HUD must come back down
    current = null;
  }

  async function run() {
    if (state.busy) return;
    state.busy = true;
    clear();
    spans = [];
    marks = [];

    const spec = SOURCES[state.source];
    overlay.show(spec.url.split("/").pop());
    const t0 = performance.now();

    let r;
    try {
      r = await loadModel(
        spec.url,
        THROTTLES[state.throttle].bps,
        (loaded, total) => overlay.progress(loaded, total),
      );
    } catch (e) {
      overlay.fail(e.message);
      state.busy = false;
      return;
    }

    spans.push({
      label: "DOWNLOAD",
      kind: "download",
      start: 0,
      end: r.downloadMs,
    });
    spans.push({
      label: "PARSE",
      kind: "parse",
      start: r.downloadMs,
      end: r.downloadMs + r.parseMs,
    });

    overlay.stage("PROCESSING");
    // Yield a frame so the overlay repaints before the blocking work
    await new Promise((res) => requestAnimationFrame(res));

    const fit = place(r.scene);

    if (CAPS[state.cap].size !== Infinity) {
      const c0 = performance.now();
      capTextures(r.scene, CAPS[state.cap].size);
      spans.push({
        label: "DOWNSAMPLE",
        kind: "parse",
        start: c0 - t0,
        end: performance.now() - t0,
      });
    }

    scene.add(r.scene);

    // Compile every program up front. Skip it and the first frame a
    // material appears stalls - after the loader has already gone
    if (state.precompile) {
      overlay.stage("COMPILING");
      const c0 = performance.now();
      renderer.compile(scene, camera);
      spans.push({
        label: "COMPILE",
        kind: "compile",
        start: c0 - t0,
        end: performance.now() - t0,
      });
    }

    r.scene.scale.setScalar(fit * 0.001);
    current = { root: r.scene, fit, bytes: r.bytes };

    marks.push({ label: "FIRST PAINT", at: performance.now() - t0 });
    report();
    overlay.hide();
    state.busy = false;
  }

  // Cap applies live - no reload, because the bytes are already here
  function applyCap() {
    if (!current || state.busy) return;
    capTextures(current.root, CAPS[state.cap].size);
    report();
  }

  const el = document.createElement("div");
  el.innerHTML = `
    <style>
      .p26 { position: fixed; bottom: 16px; right: 16px; z-index: 9999;
        font: 10px "JetBrains Mono", ui-monospace, monospace;
        background: rgba(6,6,8,.86); border: 1px solid rgba(193,18,31,.5);
        padding: 10px 12px; color: #e8e8e8; width: 258px; }
      .p26 .lbl { color: #5a5a5a; letter-spacing: .08em; margin-bottom: 6px; }
      .p26 .row { display: flex; gap: 4px; margin-bottom: 10px; }
      .p26 button { flex: 1; background: transparent; color: #5a5a5a;
        border: 1px solid rgba(255,255,255,.12); padding: 5px 0;
        font: inherit; cursor: pointer; transition: .15s; }
      .p26 button:hover { color: #e8e8e8; border-color: rgba(255,255,255,.3); }
      .p26 button.on { color: #c1121f; border-color: #c1121f; }
      .p26 .go { width: 100%; color: #e8e8e8; border-color: rgba(255,255,255,.3); }
      .p26 .keys { color: #3f3f3f; margin-top: 8px; line-height: 1.6; }
    </style>
    <div class="p26">
      <div class="lbl">SOURCE</div><div class="row" data-src></div>
      <div class="lbl">TEXTURE CAP</div><div class="row" data-cap></div>
      <div class="lbl">THROTTLE</div><div class="row" data-thr></div>
      <div class="lbl">OPTIONS</div><div class="row" data-opt></div>
      <button class="go" data-go>RELOAD  [R]</button>
      <div class="keys">1-3 SOURCE · Q W E T CAP · P PROBE · R RELOAD</div>
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

  const srcBtns = mk(
    "[data-src]",
    SOURCES.map((s) => s.key),
    (i) => {
      state.source = i;
      sync();
      run();
    },
  );
  const capBtns = mk(
    "[data-cap]",
    CAPS.map((c) => c.label),
    (i) => {
      state.cap = i;
      sync();
      applyCap();
    },
  );
  const thrBtns = mk(
    "[data-thr]",
    THROTTLES.map((t) => t.label),
    (i) => {
      state.throttle = i;
      sync();
    },
  );
  const optBtns = mk("[data-opt]", ["PRECOMPILE"], () => {
    state.precompile = !state.precompile;
    sync();
  });
  el.querySelector("[data-go]").onclick = run;

  function sync() {
    srcBtns.forEach((b, i) => b.classList.toggle("on", i === state.source));
    capBtns.forEach((b, i) => b.classList.toggle("on", i === state.cap));
    thrBtns.forEach((b, i) => b.classList.toggle("on", i === state.throttle));
    optBtns[0].classList.toggle("on", state.precompile);
  }
  sync();
  run();

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.key >= "1" && e.key <= "3") {
      state.source = Number(e.key) - 1;
      sync();
      run();
    }
    const capKey = "qwet".indexOf(k);
    if (capKey >= 0) {
      state.cap = capKey;
      sync();
      applyCap();
    }
    if (k === "r") run();
    if (k === "p") profiler.probe();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  const startTime = performance.now();
  let last = startTime;

  function tick() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    profiler.begin();
    controls.update();

    // Ease up to the FIT scale, not to 1 - easing to 1 is what sent the
    // second car off-screen in the first version of this lab
    if (current && current.root.scale.x < current.fit * 0.999) {
      const s = current.root.scale.x;
      current.root.scale.setScalar(
        current.fit + (s - current.fit) * Math.exp(-4.5 * dt),
      );
    }

    renderer.render(scene, camera);
    profiler.end();

    hud.update(
      profiler,
      `${SOURCES[state.source].key} · ${CAPS[state.cap].label}`,
    );
    requestAnimationFrame(tick);
  }
  tick();
}

const canvas = document.querySelector("canvas.webgl");
initLog26(canvas);
