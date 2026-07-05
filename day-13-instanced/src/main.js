import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

// scene setup (as usual)
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050810, 0.04);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 3, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// lighting
const ambientLight = new THREE.AmbientLight(0x223344, 4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xaaccff, 2);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// InstancedMesh - the core of day 13
const INSTANCE_COUNT = 200;

// one geometry, one material - shared across ALL 200 instances
// this is the key: only one draw call for all 200 panels
const panelGeometry = new THREE.PlaneGeometry(0.4, 0.25);
const panelMaterial = new THREE.MeshStandardMaterial({
  color: 0x112233,
  emissive: 0x0044aa,
  emissiveIntensity: 3,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
});

// InstancedMesh takes: geometry, material, count
// count is fixed at creation - can't add more instances later
const instancedMesh = new THREE.InstancedMesh(
  panelGeometry, // one shared geometry
  panelMaterial, // one shared material
  INSTANCE_COUNT, // how many copies
);
instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
// DynamicDrawUsage tells the GPU this data will update every frame
// StaticDrawUsage (default) would be faster if positions never change

scene.add(instancedMesh);

// Matrix - how I position each instance
// A Matrix4 is a 4x4 grid of numbers that encodes
// position + rotation + scale all in one compact object
// Three.js uses these internally for every object's transform
// InstancedMesh just exposes them directly since you're
// setting 200 transforms at once instead of one at a time
const dummy = new THREE.Object3D();
// Object3D is a plain invisible helper - use it to build the matrix via familiar .position/.rotation/.scale syntax
// then extract the resulting matrix and hand it to the instance

// store per-instance animation data
const instanceData = [];

for (let i = 0; i < INSTANCE_COUNT; i++) {
  // distribute instances in a sphere around the origin
  const phi = Math.acos(2 * Math.random() - 1); // polar angle
  const theta = Math.random() * Math.PI * 2; // azimuthal angle
  const radius = 4 + Math.random() * 5; // 4 to 9 units out

  // convert spherical to cartesian coordinates
  // same sin/cos circle math from Day 12, extended to 3D sphere
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  instanceData.push({
    x,
    y,
    z,
    // random rotation offsets so panels face different directions
    rotX: Math.random() * Math.PI * 2,
    rotY: Math.random() * Math.PI * 2,
    // random float speed and phase for idle animation
    floatSpeed: 0.3 + Math.random() * 0.5,
    floatPhase: Math.random() * Math.PI * 2,
    // random color per instance
    hue: Math.random(),
  });

  // set initial position
  dummy.position.set(x, y, z);
  dummy.rotation.set(instanceData[i].rotX, instanceData[i].rotY, 0);
  dummy.scale.setScalar(1);
  dummy.updateMatrix(); // recalculate the matrix from position/rotation/scale
  instancedMesh.setMatrixAt(i, dummy.matrix); // hand the matrix to instance i
}

// Per-instance color
// InstancedMesh supports one color per instance via setColorAt()
// color varies by hue - gives a range of blue/cyan/teal tones
const color = new THREE.Color();
for (let i = 0; i < INSTANCE_COUNT; i++) {
  // hsl(hue, saturation, lightness)
  // hue 0.5-0.7 = blue/cyan range
  color.setHSL(0.5 + instanceData[i].hue * 0.2, 1.0, 0.6);
  instancedMesh.setColorAt(i, color);
}
instancedMesh.instanceColor.needsUpdate = true;

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// animate
const startTime = performance.now();

const animate = () => {
  requestAnimationFrame(animate);

  const t = (performance.now() - startTime) / 1000;

  // update each instance's position every frame for floating animation
  for (let i = 0; i < INSTANCE_COUNT; i++) {
    const d = instanceData[i];

    // gentle float: offset y by a sin wave unique to each instance
    // floatPhase offsets the wave so they don't all move in sync
    const floatY = Math.sin(t * d.floatSpeed + d.floatPhase) * 0.15;

    dummy.position.set(d.x, d.y + floatY, d.z);
    dummy.rotation.set(d.rotX, d.rotY + t * 0.1, 0); // slow spin
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  // after updating all matrices, tell Three.js to re-upload them to the GPU
  // this is required - skipping it means the GPU keeps the old positions
  instancedMesh.instanceMatrix.needsUpdate = true;

  controls.update();
  renderer.render(scene, camera);
};

animate();
