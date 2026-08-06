import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Profiler } from "./profiler.js";
import { ProfilerHUD } from "./profiler-hud.js";

const MAX_COUNT = 1200;
const COUNTS = [100, 300, 600, 1200];
const FIELD = 130;
const LOD_NEAR = 45; // tier 0 -> 1
const LOD_FAR = 100; // tier 1 -> 2

// x, y, z, scale, rotY, tilt
const seeds = new Float32Array(MAX_COUNT * 6);
for (let i = 0; i < MAX_COUNT; i++) {
  const o = i * 6;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * FIELD; // sqrt keeps the disc even
  seeds[o] = Math.cos(a) * r;
  seeds[o + 1] = -1 + Math.random() * 2;
  seeds[o + 2] = Math.sin(a) * r;
  seeds[o + 3] = 0.7 + Math.random() * 0.8;
  seeds[o + 4] = Math.random() * Math.PI * 2;
  seeds[o + 5] = (Math.random() - 0.5) * 0.5;
}

// The Lance. Two helical strands twisting up a tapering axis, splitting
// into a bowed two-prong head. Every tier uses the same curves - only
// the segment counts change, which is the whole point of LOD
const TIERS = [
  {
    shaftTub: 200,
    shaftRad: 14,
    prongTub: 80,
    prongRad: 12,
    ringA: 12,
    ringB: 64,
    tip: 20,
  },
  {
    shaftTub: 70,
    shaftRad: 8,
    prongTub: 32,
    prongRad: 8,
    ringA: 6,
    ringB: 24,
    tip: 10,
  },
  {
    shaftTub: 24,
    shaftRad: 5,
    prongTub: 12,
    prongRad: 5,
    ringA: 4,
    ringB: 12,
    tip: 6,
  },
];

function strandCurve(phase) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const y = -4.2 + t * 6.2;
    const rad = 0.2 * (1 - t * 0.72); // helix tightens toward the head
    const a = phase + t * Math.PI * 4.5;
    pts.push(new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function prongCurve(sign) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    // bows out to ~0.52 at t=0.59, then draws back in toward the point
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

function buildLance(tier) {
  const T = TIERS[tier];
  const parts = [];

  for (const phase of [0, Math.PI]) {
    parts.push(
      new THREE.TubeGeometry(
        strandCurve(phase),
        T.shaftTub,
        0.075,
        T.shaftRad,
        false,
      ),
    );
  }

  const up = new THREE.Vector3(0, 1, 0);
  for (const sign of [1, -1]) {
    const c = prongCurve(sign);
    parts.push(new THREE.TubeGeometry(c, T.prongTub, 0.062, T.prongRad, false));

    // TubeGeometry can't taper, so the point is a cone aligned to the
    // curve's end tangent
    const end = c.getPoint(1);
    const tan = c.getTangent(1);
    const cone = new THREE.ConeGeometry(0.062, 0.5, T.tip);
    cone.translate(0, 0.25, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, tan));
    cone.translate(end.x, end.y, end.z);
    parts.push(cone);
  }

  const tail = new THREE.TorusGeometry(0.3, 0.06, T.ringA, T.ringB);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, -4.1, 0);
  parts.push(tail);

  const collar = new THREE.TorusGeometry(0.22, 0.05, T.ringA, T.ringB);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 1.95, 0);
  parts.push(collar);

  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

const GEO = [buildLance(0), buildLance(1), buildLance(2)];

const MAT_STD = new THREE.MeshStandardMaterial({
  color: 0xb9bcc4,
  metalness: 0.85,
  roughness: 0.32,
});
// Material LOD: unlit, no lighting math per fragment. Cheaper in a
// different way than fewer triangles — this one cuts fragment cost.
const MAT_BASIC = new THREE.MeshBasicMaterial({ color: 0x6c6f77 });

const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const dummy = new THREE.Object3D();

function frustumFrom(cam) {
  cam.updateMatrixWorld();
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
}

// The lance spans y −4.2 to 4.6 - tall and thin, so its bounding sphere
// is much larger than its silhouette. Exactly the shape that stays
// "visible" long after it has left the screen
function sphereFor(i) {
  const o = i * 6;
  const s = seeds[o + 3];
  _sphere.center.set(seeds[o], seeds[o + 1] + 0.2 * s, seeds[o + 2]);
  _sphere.radius = 5.0 * s;
  return _sphere;
}

function poseDummy(i) {
  const o = i * 6;
  dummy.position.set(seeds[o], seeds[o + 1], seeds[o + 2]);
  dummy.rotation.set(seeds[o + 5], seeds[o + 4], 0);
  dummy.scale.setScalar(seeds[o + 3]);
  dummy.updateMatrix();
}

// MODE 0 - one Mesh per lance, always tier 0. The baseline: N draw calls
// and the full triangle load, with three.js's built-in culling
function modeObjects(count) {
  const group = new THREE.Group();
  const meshes = [];
  for (let i = 0; i < count; i++) {
    poseDummy(i);
    const m = new THREE.Mesh(GEO[0], MAT_STD);
    m.position.copy(dummy.position);
    m.rotation.copy(dummy.rotation);
    m.scale.copy(dummy.scale);
    group.add(m);
    meshes.push(m);
  }
  return {
    object: group,
    label: "OBJECTS",
    apply(opts) {
      // Three.js culls against the camera passed to render(), in debug
      // view that's the wrong camera, so we drive .visible ourselves
      for (let i = 0; i < count; i++) meshes[i].frustumCulled = opts.cull;
      if (opts.manualVisible) {
        for (let i = 0; i < count; i++)
          meshes[i].visible =
            !opts.cull || _frustum.intersectsSphere(sphereFor(i));
      } else {
        for (let i = 0; i < count; i++) meshes[i].visible = true;
      }
      return null;
    },
    dispose() {},
  };
}

// MODE 1 - THREE.LOD per lance. Still N draw calls; what drops is
// triangles per call. lod.update() picks a level by distance to camera
function modeLod(count) {
  const group = new THREE.Group();
  const lods = [];
  for (let i = 0; i < count; i++) {
    poseDummy(i);
    const lod = new THREE.LOD();
    lod.addLevel(new THREE.Mesh(GEO[0], MAT_STD), 0);
    lod.addLevel(new THREE.Mesh(GEO[1], MAT_STD), LOD_NEAR);
    lod.addLevel(new THREE.Mesh(GEO[2], MAT_STD), LOD_FAR);
    lod.position.copy(dummy.position);
    lod.rotation.copy(dummy.rotation);
    lod.scale.copy(dummy.scale);
    group.add(lod);
    lods.push(lod);
  }
  return {
    object: group,
    label: "LOD",
    apply(opts) {
      const tiers = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        const lod = lods[i];
        lod.frustumCulled = opts.cull;
        // Always update against the MAIN camera - using the debug camera
        // here would silently change which tier every lance picks
        lod.levels[2].object.material = opts.matLod ? MAT_BASIC : MAT_STD;
        if (opts.lod) {
          lod.update(opts.mainCam);
        } else {
          // Force tier 0 - LOD.update() would otherwise always pick by distance
          lod.levels.forEach((lvl, li) => {
            lvl.object.visible = li === 0;
          });
        }
        if (opts.manualVisible) {
          lod.visible = !opts.cull || _frustum.intersectsSphere(sphereFor(i));
        } else {
          lod.visible = true;
        }
        if (lod.visible) {
          const d = lod.position.distanceTo(opts.mainCam.position);
          tiers[d < LOD_NEAR ? 0 : d < LOD_FAR ? 1 : 2]++;
        }
      }
      return tiers;
    },
    dispose() {},
  };
}

// MODE 2 - three InstancedMeshes, one per tier. Each frame: frustum-test
// every lance, bin the survivors by distance, pack their matrices toward
// the front of the right buffer, set .count, three draw calls total,
// and per-instance culling is back
function modeInstanced(count) {
  const group = new THREE.Group();
  const meshes = TIERS.map((_, t) => {
    const m = new THREE.InstancedMesh(GEO[t], MAT_STD, count);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; // we cull per instance ourselves
    group.add(m);
    return m;
  });

  return {
    object: group,
    label: "INSTANCED",
    apply(opts) {
      const n = [0, 0, 0];
      const cam = opts.mainCam.position;
      for (let i = 0; i < count; i++) {
        const s = sphereFor(i);
        if (opts.cull && !_frustum.intersectsSphere(s)) continue;
        const d = s.center.distanceTo(cam);
        const tier = opts.lod ? (d < LOD_NEAR ? 0 : d < LOD_FAR ? 1 : 2) : 0;
        poseDummy(i);
        meshes[tier].setMatrixAt(n[tier]++, dummy.matrix);
      }
      for (let t = 0; t < 3; t++) {
        meshes[t].count = n[t];
        meshes[t].visible = n[t] > 0; // count 0 shouldn't cost a call
        meshes[t].instanceMatrix.needsUpdate = true;
        meshes[t].material = t === 2 && opts.matLod ? MAT_BASIC : MAT_STD;
      }
      return n;
    },
    dispose() {
      meshes.forEach((m) => m.dispose());
    },
  };
}

const MODES = [modeObjects, modeLod, modeInstanced];
const MODE_NAMES = ["OBJECTS", "LOD", "INSTANCED"];

function buildPanel(h) {
  const el = document.createElement("div");
  el.innerHTML = `
    <style>
      .p24 { position: fixed; bottom: 16px; right: 16px; z-index: 9999;
        font: 10px "JetBrains Mono", ui-monospace, monospace;
        background: rgba(6,6,8,.86); border: 1px solid rgba(193,18,31,.5);
        padding: 10px 12px; color: #e8e8e8; width: 260px; }
      .p24 .lbl { color: #5a5a5a; letter-spacing: .08em; margin-bottom: 6px; }
      .p24 .row { display: flex; gap: 4px; margin-bottom: 10px; }
      .p24 button { flex: 1; background: transparent; color: #5a5a5a;
        border: 1px solid rgba(255,255,255,.12); padding: 5px 0;
        font: inherit; cursor: pointer; transition: .15s; }
      .p24 button:hover { color: #e8e8e8; border-color: rgba(255,255,255,.3); }
      .p24 button.on { color: #c1121f; border-color: #c1121f; }
      .p24 .cnt { color: #e8e8e8; float: right; }
      .p24 .stat { color: #5a5a5a; border-top: 1px solid rgba(255,255,255,.1);
        padding-top: 8px; margin-top: 2px; line-height: 1.6; }
      .p24 .stat b { color: #e8e8e8; font-weight: normal; float: right; }
    </style>
    <div class="p24">
      <div class="lbl">MODE</div><div class="row" data-mode></div>
      <div class="lbl">COUNT <span class="cnt" data-cnt></span></div>
      <div class="row" data-count></div>
      <div class="lbl">TOGGLE</div><div class="row" data-tog></div>
      <div class="stat">
        <div>VISIBLE <b data-vis>—</b></div>
        <div>TIER 0 / 1 / 2 <b data-tiers>—</b></div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const mk = (host, labels, cb) =>
    labels.map((t, i) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = () => cb(i);
      host.appendChild(b);
      return b;
    });

  const modeRow = el.querySelector("[data-mode]");
  const countRow = el.querySelector("[data-count]");
  const togRow = el.querySelector("[data-tog]");

  const modeBtns = mk(modeRow, ["1", "2", "3"], h.onMode);
  const countBtns = mk(countRow, COUNTS.map(String), (i) =>
    h.onCount(COUNTS[i]),
  );
  const togBtns = mk(togRow, ["CULL", "LOD", "MAT", "VIEW"], h.onToggle);

  return {
    sync(s) {
      modeBtns.forEach((b, i) => b.classList.toggle("on", i === s.mode));
      countBtns.forEach((b, i) =>
        b.classList.toggle("on", COUNTS[i] === s.count),
      );
      const flags = [s.cull, s.lod, s.matLod, s.debug];
      togBtns.forEach((b, i) => b.classList.toggle("on", flags[i]));
      el.querySelector("[data-cnt]").textContent = s.count;
    },
    stats(visible, tiers) {
      el.querySelector("[data-vis]").textContent = visible ?? "—";
      el.querySelector("[data-tiers]").textContent = tiers
        ? tiers.join(" / ")
        : "—";
    },
  };
}

function initLog24(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070a);
  scene.fog = new THREE.Fog(0x07070a, 90, 230);

  const aspect = window.innerWidth / window.innerHeight;
  const mainCam = new THREE.PerspectiveCamera(50, aspect, 1, 240);
  mainCam.position.set(0, 10, 55);

  // Deliberately far outside the field so the frustum is fully visible
  const debugCam = new THREE.PerspectiveCamera(55, aspect, 1, 900);
  debugCam.position.set(150, 190, 250);
  debugCam.lookAt(0, 0, 0);

  const camHelper = new THREE.CameraHelper(mainCam);
  camHelper.visible = false;
  scene.add(camHelper);

  const controls = new OrbitControls(mainCam, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxDistance = 200;

  scene.add(new THREE.AmbientLight(0x404050, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(40, 70, 30);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc1121f, 1.6);
  rim.position.set(-50, -10, -40);
  scene.add(rim);

  const profiler = new Profiler(renderer);
  const hud = new ProfilerHUD();

  const state = {
    mode: 2,
    count: 300,
    cull: true,
    lod: true,
    matLod: false,
    debug: false,
  };
  let current = null;
  let uncapped = false;

  function rebuild() {
    if (current) {
      scene.remove(current.object);
      current.dispose();
    }
    current = MODES[state.mode](state.count);
    scene.add(current.object);
    panel.sync(state);
  }

  const panel = buildPanel({
    onMode: (i) => {
      state.mode = i;
      rebuild();
    },
    onCount: (n) => {
      state.count = n;
      rebuild();
    },
    onToggle: (i) => {
      if (i === 0) state.cull = !state.cull;
      if (i === 1) state.lod = !state.lod;
      if (i === 2) state.matLod = !state.matLod;
      if (i === 3) state.debug = !state.debug;
      camHelper.visible = state.debug;
      panel.sync(state);
    },
  });
  rebuild();

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.key >= "1" && e.key <= "3") {
      state.mode = Number(e.key) - 1;
      rebuild();
    }
    if (k === "c") panel && ((state.cull = !state.cull), panel.sync(state));
    if (k === "l") ((state.lod = !state.lod), panel.sync(state));
    if (k === "m") ((state.matLod = !state.matLod), panel.sync(state));
    if (k === "v")
      ((state.debug = !state.debug),
        (camHelper.visible = state.debug),
        panel.sync(state));
    if (k === "p") profiler.probe();
    if (k === "u") uncapped = !uncapped;
  });

  window.addEventListener("resize", () => {
    const a = window.innerWidth / window.innerHeight;
    mainCam.aspect = a;
    mainCam.updateProjectionMatrix();
    debugCam.aspect = a;
    debugCam.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  const startTime = performance.now();

  function tick() {
    const t = (performance.now() - startTime) / 1000;

    profiler.begin();

    controls.update();
    frustumFrom(mainCam);

    const counts = current.apply({
      cull: state.cull,
      lod: state.lod,
      matLod: state.matLod,
      mainCam,
      manualVisible: state.debug,
    });

    if (state.debug) camHelper.update();
    renderer.render(scene, state.debug ? debugCam : mainCam);

    profiler.end();

    panel.stats(counts ? counts.reduce((a, b) => a + b, 0) : null, counts);
    hud.update(
      profiler,
      `${current.label} · ${state.count}${uncapped ? " · UNCAP" : ""}`,
    );

    if (uncapped) setTimeout(tick, 0);
    else requestAnimationFrame(tick);
  }
  tick();
}

initLog24(document.querySelector("canvas.webgl"));

// so basically the log 24 is: don't draw what isn't visible, and don't spend detail where it won't be noticed

// Frustum culling - is it on screen?
// a camera sees a pyramid-shaped volume
// anything fully outside it can't appear in the image, so there's no reason to send it to the GPU
// three.js tests each object's bounding sphere against that volume and skips the failures
// free correctness - the picture is identical either way

// LOD - how far away is it?
// A lance 200 metres out covers a few pixels
// Drawing it with 18,000 triangles is waste.
// So just keep three versions of the mesh and pick by distance.
// Far things get the crude one and nobody can tell

// The catch
// neither is free, culling costs a test per object per frame whether or not it culls anything
// LOD costs a distance check plus memory for three copies.
// point the camera into a dense crowd where nothing is cullable and you've paid full price for nothing

// Notes
// Log 23 asked how many times do you ask the GPU to draw? Log 24 asks which of those requests didn't need to happen?