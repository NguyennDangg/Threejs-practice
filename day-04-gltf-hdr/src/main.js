import "./style.css";

import * as THREE from "three";

import {
  OrbitControls,
  GLTFLoader,
  RGBELoader,
} from "three/examples/jsm/Addons.js";

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 2, 8);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// tone mapping — controls how HDR brightness maps to screen (smooth operating for monitor)
// THREE.ACESFilmicToneMapping mimics a real camera/film exposure
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
// Enable shadow maps on the renderer
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // Clean, non-pixelated shadows (PCFSoftShadowMap)
document.body.appendChild(renderer.domElement);

// Controls virtual camera
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.target.set(0, 0.5, 0); // orbit around the middle of the car, not the floor

// HDR Environment
// HDRLoader loads .hdr files
// The HDR becomes both:
//   1. the background
//   2. the light source that illuminates the model (no need to add light source)
const rgbeLoader = new RGBELoader();
rgbeLoader.load("/assets/studio_lighting.hdr", (texture) => {
  // EquirectangularReflectionMapping tells Three.js
  // this is a 360 panoramic image, wrap it around the scene
  texture.mapping = THREE.EquirectangularReflectionMapping;

  scene.background = texture; // sets it as the visible background
  scene.environment = texture; // uses it to light everything in the scene
});

// create a dark floor to catch the shadows
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.8,
    metalness: 0.2,
  }),
);
ground.rotation.x = -Math.PI / 2; // flip it flat
ground.position.y = 0; // keeps it exactly at the bottom of the tires
ground.receiveShadow = true; // let it catch shadows
scene.add(ground);

// Add an overhead directional light to drop the shadow downwards
// Combining the HDR for reflections and a DirectionalLight for sharp floor shadows
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 5); // Position it high up like a studio spot lamp
dirLight.castShadow = true; // Allow it to cast shadows!
scene.add(dirLight);

// GLTF Model
const loader = new GLTFLoader();

loader.load(
  "/assets/mercedes_gt3.glb", // path to the model

  // onLoad — fires when the model is fully loaded
  (gltf) => {
    const model = gltf.scene; // gltf.scene is the root object containing everything

    // Scale the model — GLTF models often come in wrong sizes
    // Try 1 first, adjust if the car is too big or too small
    model.scale.set(2, 2, 2);

    // Center the model at origin
    model.position.set(0, 0, 0);

    // Enable shadows on every mesh inside the model
    // IMPORTANT for 3d object
    model.traverse((child) => {
      // traverse walks through every object inside the model
      // child.isMesh checks if this particular object is a mesh
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(model);
  },

  // onProgress — fires while loading, gives you % complete
  (progress) => {
    if (progress.total > 0) {
      const percent = Math.round((progress.loaded / progress.total) * 100);
      console.log(`Loading: ${percent}%`);
    }
  },

  // onError — fires if something goes wrong
  (error) => {
    console.error("Model failed to load:", error);
  },
);

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Animate
const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

animate();
