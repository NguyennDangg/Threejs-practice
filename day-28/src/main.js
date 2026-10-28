import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ScrollStage } from "./scroll-stage.js";
import { CameraRig } from "./camera-rig.js";

function initLog28(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0e);
  scene.fog = new THREE.Fog(0x0a0a0e, 14, 46);

  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    200,
  );

  const group = new THREE.Group();
  scene.add(group);

  const slabGeo = new RoundedBoxGeometry(1.6, 2.6, 0.36, 4, 0.06);
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x16161e,
    roughness: 0.42,
    metalness: 0.28,
  });
  const slabs = [];
  const COUNT = 5;

  for (let i = 0; i < COUNT; i++) {
    const m = new THREE.Mesh(slabGeo, slabMat);
    const ang = (i / COUNT) * Math.PI * 2;
    m.userData.home = new THREE.Vector3(
      Math.cos(ang) * 2.2,
      (i - (COUNT - 1) / 2) * 0.55,
      Math.sin(ang) * 2.2,
    );
    m.userData.homeRotY = ang + Math.PI / 2;
    m.userData.scatter = new THREE.Vector3(
      Math.cos(ang) * 6,
      (i - (COUNT - 1) / 2) * 1.4 + 0.4,
      Math.sin(ang) * 6,
    );
    m.userData.scatterRotY = ang;
    m.position.copy(m.userData.home);
    m.rotation.y = m.userData.homeRotY;
    group.add(m);
    slabs.push(m);
  }

  const axis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 5.4, 24),
    new THREE.MeshStandardMaterial({
      color: 0xc1121f,
      roughness: 0.35,
      metalness: 0.6,
    }),
  );
  group.add(axis);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x101015, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.4;
  scene.add(floor);

  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(6, 8, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc1121f, 2.2);
  rim.position.set(-6, 2, -7);
  scene.add(rim);

  const rig = new CameraRig(camera, [
    { t: 0.0, pos: [0, 1.4, 9.2], look: [0, 0, 0], fov: 40 },
    { t: 0.25, pos: [3.6, 1, 4.4], look: [0, 0.2, 0], fov: 38 },
    { t: 0.5, pos: [0, 2.2, -6.4], look: [0, 0, 0], fov: 42 },
    { t: 0.75, pos: [-5.2, 1.6, 3], look: [0, 0.1, 0], fov: 36 },
    { t: 1.0, pos: [0, 1.4, 9.2], look: [0, 0, 0], fov: 40 },
  ]);

  const stage = new ScrollStage({ lerp: 0.1 });
  const labelEls = [...document.querySelectorAll("[data-stage]")];
  const cueEl = document.querySelector("[data-cue]");

  function updateLabels(p) {
    const STATIONS = [0, 0.25, 0.5, 0.75, 1];
    const HALF = 0.11;
    for (let i = 0; i < labelEls.length; i++) {
      const d = Math.abs(p - STATIONS[i]);
      const a = Math.max(0, 1 - d / HALF);
      labelEls[i].style.opacity = String(a);
      labelEls[i].style.transform = `translateY(${(1 - a) * 18}px)`;
    }
    if (cueEl) cueEl.style.opacity = p > 0.02 ? "0" : "1";
  }

  stage.onProgress((p) => {
    rig.apply(p);
    const s = Math.min(1, Math.max(0, (p - 0.55) / 0.32));
    const e = s * s * (3 - 2 * s);
    for (const m of slabs) {
      m.position.lerpVectors(m.userData.home, m.userData.scatter, e);
      m.rotation.y =
        m.userData.homeRotY +
        (m.userData.scatterRotY - m.userData.homeRotY) * e;
    }
    group.rotation.y = p * Math.PI * 0.35;
    updateLabels(p);
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  function tick() {
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

const canvas = document.querySelector("canvas.webgl");
if (!canvas) throw new Error("No canvas.webgl");
initLog28(canvas);
