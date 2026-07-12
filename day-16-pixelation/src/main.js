import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

// lighting
scene.add(new THREE.AmbientLight(0x334455, 5));
const dirLight = new THREE.DirectionalLight(0xffddaa, 6);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.3,
    metalness: 0.5,
  }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ── GLTF model ──
const loader = new GLTFLoader();
loader.load("/assets/RB20.glb", (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += size.y / 2;
  scene.add(model);
});

// ── Post-processing ──
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const pixelateShader = {
  uniforms: {
    tDiffuse: { value: null },
    u_resolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    u_pixelSize: { value: 6.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 u_resolution;
    uniform float u_pixelSize;
    varying vec2 vUv;
    void main() {
      vec2 pixelCoord = vUv * u_resolution;
      vec2 snapped = floor(pixelCoord / u_pixelSize) * u_pixelSize;
      vec2 pixelUv = snapped / u_resolution;
      gl_FragColor = texture2D(tDiffuse, pixelUv);
    }
  `,
};

const pixelatePass = new ShaderPass(pixelateShader);
composer.addPass(pixelatePass);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  pixelatePass.uniforms.u_resolution.value.set(
    window.innerWidth,
    window.innerHeight,
  );
});

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  composer.render();
};

animate();
