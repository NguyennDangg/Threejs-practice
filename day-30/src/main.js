import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Text } from "troika-three-text";

function initLog30(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0e);
  scene.fog = new THREE.Fog(0x0a0a0e, 10, 45);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 0, 11);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.5;
  controls.maxDistance = 25;

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xc1121f, 2.5);
  dirLight.position.set(5, 5, 8);
  scene.add(dirLight);

  const group = new THREE.Group();
  scene.add(group);

  const WORDS = ["RESOLUTION", "INDEPENDENT", "DISTANCE", "FIELDS"];
  const texts = [];

  WORDS.forEach((word, i) => {
    const textMesh = new Text();
    textMesh.text = word;
    textMesh.fontSize = 1.05;
    // Không chỉ định font → Troika dùng fallback system font (Roboto mặc định)
    textMesh.anchorX = "center";
    textMesh.anchorY = "middle";
    textMesh.position.y = (1.5 - i) * 1.3;
    textMesh.position.z = (i - 1.5) * 0.8;
    textMesh.color = i === 0 ? 0xc1121f : 0xe8e8e8;

    // Đợi sync xong mới sửa material
    textMesh.addEventListener("synccomplete", () => {
      if (textMesh.material) {
        textMesh.material.roughness = 0.2;
        textMesh.material.metalness = 0.4;
      }
    });

    textMesh.sync();
    group.add(textMesh);
    texts.push(textMesh);
  });

  const subtitle = new Text();
  subtitle.text =
    "Vector-sharp glyphs rendered via 3-channel Signed Distance Fields.\nNo geometry bloating. Constant texture footprint.";
  subtitle.fontSize = 0.22;
  subtitle.anchorX = "center";
  subtitle.anchorY = "middle";
  subtitle.position.set(0, -3.2, 0);
  subtitle.color = 0x5a5a5a;
  subtitle.lineHeight = 1.4;
  subtitle.textAlign = "center";
  subtitle.sync();
  group.add(subtitle);

  let mode = "depth";
  const buttons = document.querySelectorAll(".controls button");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.mode;
      applyMode();
    });
  });

  function applyMode() {
    texts.forEach((t, i) => {
      if (mode === "depth") {
        t.outlineWidth = 0;
        t.color = i === 0 ? 0xc1121f : 0xe8e8e8;
      } else if (mode === "kinetic") {
        t.outlineWidth = 0;
        t.color = 0xe8e8e8;
      } else if (mode === "outline") {
        t.color = 0x0a0a0e;
        t.outlineWidth = 0.035;
        t.outlineColor = i === 0 ? 0xc1121f : 0x888888;
      }
      t.sync();
    });
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  // Fix: dùng performance.now() thay vì THREE.Clock
  const startTime = performance.now();

  function tick() {
    const elapsed = (performance.now() - startTime) / 1000;
    controls.update();

    if (mode === "kinetic") {
      texts.forEach((t, i) => {
        t.position.x = Math.sin(elapsed * 2.2 + i * 0.7) * 0.8;
        t.position.z = Math.cos(elapsed * 1.8 + i * 0.7) * 1.2;
      });
      group.rotation.y = Math.sin(elapsed * 0.3) * 0.15;
    } else {
      texts.forEach((t, i) => {
        t.position.x += (0 - t.position.x) * 0.08;
        const targetZ = (i - 1.5) * 0.8;
        t.position.z += (targetZ - t.position.z) * 0.08;
      });
      group.rotation.y += (0 - group.rotation.y) * 0.08;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

const canvas = document.querySelector("canvas.webgl");
if (!canvas) throw new Error("No canvas.webgl");
initLog30(canvas);
