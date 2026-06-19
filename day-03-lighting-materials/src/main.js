import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
// import { Timer } from 'three/addons/misc/Timer.js';
import * as dat from "dat.gui";

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true; // enable shadow rendering
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Materials
// MeshStandardMaterial — physically based
// roughness: 0 = mirror, 1 = totally rough (controls how blurry the reflections are)
// metalness: 0 = plastic, 1 = metal (controls how metalic the object feels)
// define how the object looks to the user
const material = new THREE.MeshStandardMaterial({
  color: 0xff4444,
  roughness: 0.3,
  metalness: 0.8,
});

// Objects

// Sphere
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), material);
sphere.position.x = -2.5;
sphere.castShadow = true;
scene.add(sphere);

// Box
const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), material);
box.castShadow = true;
scene.add(box);

// Torus
const torus = new THREE.Mesh(
  new THREE.TorusGeometry(0.8, 0.3, 16, 100),
  material,
);
torus.position.x = 2.5;
torus.castShadow = true;
scene.add(torus);

// Floor — receives shadows
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2; // rotate flat
floor.position.y = -1.2;
floor.receiveShadow = true;
scene.add(floor);

// Lights

// AmbientLight — flat fill, no direction
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

// DirectionalLight — like the sun, parallel rays
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 8, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// PointLight — like a bulb
const pointLight = new THREE.PointLight(0x4488ff, 50);
pointLight.position.set(-4, 2, 2);
scene.add(pointLight);

// PointLight helper — shows where the light is (already used in the day 01 - project)
const pointLightHelper = new THREE.PointLightHelper(pointLight, 0.3);
scene.add(pointLightHelper);

// DirectionalLight helper — shows a grid and the ray direction (The sun helper :D)
// (the second parameter '1' is just the size of the helper icon)
const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 1);
scene.add(dirLightHelper);

// Gui (the same as day 02)
const gui = new dat.GUI();

const matFolder = gui.addFolder("Material");
matFolder.add(material, "roughness", 0, 1).name("roughness");
matFolder.add(material, "metalness", 0, 1).name("metalness");
matFolder.add(material, "wireframe");
matFolder.open();

const lightFolder = gui.addFolder("Directional Light");
lightFolder.add(dirLight, "intensity", 0, 10);
lightFolder.add(dirLight.position, "x", -10, 10);
lightFolder.add(dirLight.position, "y", -10, 10);
lightFolder.add(dirLight.position, "z", -10, 10);
lightFolder.open();

const pointFolder = gui.addFolder("Point Light");
pointFolder.add(pointLight, "intensity", 0, 200);
pointFolder.add(pointLight.position, "x", -10, 10).name("light X");
pointFolder.add(pointLight.position, "y", -10, 10).name("light Y");
pointFolder.add(pointLight.position, "z", -10, 10).name("light Z");
pointFolder.open();

// Resize
// responsive for threejs
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Pro-trick: If the window is narrow (mobile), pull the camera back
  // so the objects don't get cut off on the edges!
  if (window.innerWidth < 600) {
    camera.position.z = 8; // Push back further
  } else {
    camera.position.z = 6; // Standard desktop distance
  }

  // Call this once at the end to apply all camera updates smoothly!
  camera.updateProjectionMatrix();
});

// Animate function with real time respond
const clock = new THREE.Clock();

// New tool to replace THREE.Clock()
// const timer = new Timer();

const animate = () => {
  requestAnimationFrame(animate);

  // must update the time every single frame
  // timer.update();

  // getting the delta time will work perfectly
  const delta = clock.getDelta();

  // slowly rotate all objects
  // animation will move smoothly now
  sphere.rotation.y += 0.3 * delta;
  box.rotation.y += 0.3 * delta;
  box.rotation.x += 0.1 * delta;
  torus.rotation.y += 0.3 * delta;
  torus.rotation.x += 0.3 * delta;

  // IMPORTANT: force the helpers to update their positions on screen!
  pointLightHelper.update();
  dirLightHelper.update(); // the sun helper moves with the sliders!

  controls.update();
  renderer.render(scene, camera);
};

animate();
