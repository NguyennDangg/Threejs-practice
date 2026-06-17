import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import * as dat from "dat.gui";

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.z = 3;

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x00ffff });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const light = new THREE.PointLight(0xffffff, 100);
light.position.set(5, 5, 5);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // 0x equals #
scene.add(ambientLight);

const renderer = new THREE.WebGLRenderer({ antialias: true }); // without renderer nothing appears on the screen
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // smooth deceleration (without damping, the camera stops instantly when you let go of the mouse)
controls.dampingFactor = 0.05; // 0.05 is slow and smooth but 0.5 is almost instant
controls.autoRotate = false; // try setting this to true (spins the camera around the target automatically)
controls.enablePan = false; // disable right-click drag (set to true so users can throw the cube out of the screen)

const gui = new dat.GUI(); // creates the panel in the top right corner

// Cube rotation sliders
const cubeFolder = gui.addFolder("Cube");  // collapsible group
cubeFolder.add(cube.rotation, "x", 0, Math.PI * 2).name("rotate X");
cubeFolder.add(cube.rotation, "y", 0, Math.PI * 2).name("rotate Y");
cubeFolder.add(cube.rotation, "z", 0, Math.PI * 2).name("rotate Z");
cubeFolder.add(material, "wireframe");
cubeFolder.open();

// Color picker
const colorParams = { color: "#00ffff" };
cubeFolder.addColor(colorParams, "color").onChange((val) => {
  material.color.set(val);
});

// Light controls
const lightFolder = gui.addFolder("Light");
lightFolder.add(light.position, "x", -10, 10);
lightFolder.add(light.position, "y", -10, 10);
lightFolder.add(light.position, "z", -10, 10);
lightFolder.add(light, "intensity", 0, 200);
lightFolder.open();

// Clock (delta time) returns the time in seconds since the last time you called it
const clock = new THREE.Clock(); 

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const animate = () => {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Speed is now per-second not per-frame
  // works the same on 60fps and 144fps monitors
  // framerate-independent animation and you should always do it in real projects.
  cube.rotation.y += 0.5 * delta;

  controls.update(); // required when enableDamping is true (without it the damping and auto-rotation never actually calculate, it has to be called every frame)
  renderer.render(scene, camera);
};

animate();
