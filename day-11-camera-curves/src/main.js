import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader, HDRLoader } from "three/examples/jsm/Addons.js";

// scene
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canvas"),
  antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// HDR environment
// reuse studio_lighting if needed, can be skip for now
// const hdrLoader = new HDRLoader()
// hdrLoader.load('/assets/studio_lighting.hdr', (texture) => {
//   texture.mapping = THREE.EquirectangularReflectionMapping
//   scene.background = texture
//   scene.environment = texture
// })

// dark background to match the in-game garage feel
scene.background = new THREE.Color(0x0a0a0a);

// lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// colored accent lights — gives that in-game garage feel
const blueLight = new THREE.PointLight(0x4488ff, 30);
blueLight.position.set(-5, 2, 3);
scene.add(blueLight);

const redLight = new THREE.PointLight(0xff2200, 20);
redLight.position.set(5, 1, -3);
scene.add(redLight);

// ground plane
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.8,
    metalness: 0.3,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// GLTF model
let model;
const loader = new GLTFLoader();
loader.load(
  "/assets/RB20.glb",
  (gltf) => {
    model = gltf.scene;

    // auto-center and ground the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    model.position.y += size.y / 2;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(model);
    console.log("RB20 loaded, size:", size);
  },
  (progress) => {
    if (progress.total > 0) {
      console.log(
        `Loading: ${Math.round((progress.loaded / progress.total) * 100)}%`,
      );
    }
  },
  (error) => console.error("Model failed:", error),
);

// camera curve - the core of Day 11
// CatmullRomCurve3 takes an array of Vector3 points and smoothly
// interpolates between them. Think of it as GPS waypoints
// you define where the camera should be at key moments
// and Three.js draws a smooth path between all of them
const cameraPath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 2, 8), // start — front, slightly elevated
    new THREE.Vector3(4, 3, 6), // front-right quarter view
    new THREE.Vector3(7, 2, 0), // pure side view, right
    new THREE.Vector3(4, 1.5, -6), // rear-right quarter
    new THREE.Vector3(0, 2, -8), // pure rear view
    new THREE.Vector3(-4, 1.5, -6), // rear-left quarter
    new THREE.Vector3(-7, 2, 0), // pure side view, left
    new THREE.Vector3(-4, 3, 6), // front-left quarter
    new THREE.Vector3(0, 2, 8), // back to start — closes the loop
  ],
  true,
); // true = closed loop, the path wraps around seamlessly

// visualize the camera path (debug helper)
// This draws the actual curve as a visible line in the scene
// so you can see exactly where the camera will travel
// Comment it out once you're happy with the path.
const pathPoints = cameraPath.getPoints(100);
const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
const pathLine = new THREE.Line(
  pathGeometry,
  new THREE.LineBasicMaterial({
    color: 0x00ffff,
    opacity: 0.3,
    transparent: true,
  }),
);
scene.add(pathLine);

//  scroll state
// scrollProgress: 0.0 = top of page, 1.0 = bottom of page
// This single number drives everything - where the camera sits
// on the path, which data panels are visible, all of it
let scrollProgress = 0;
let targetScrollProgress = 0;

window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  targetScrollProgress = scrollTop / maxScroll; // normalize to 0–1
});

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// animate
const lookAtTarget = new THREE.Vector3(); // reused every frame, no GC pressure

const animate = () => {
  requestAnimationFrame(animate);

  // smooth the scroll value - same lerp pattern you've used since Day 01
  // 0.05 = slow, cinematic feel. increase for snappier response.
  scrollProgress += (targetScrollProgress - scrollProgress) * 0.05;

  // getPoint(t) returns a Vector3 position ON the curve at progress t (0–1)
  // as scrollProgress goes from 0 to 1, the camera travels the full path
  const camPos = cameraPath.getPoint(scrollProgress);
  camera.position.copy(camPos);

  // always look at the model's center (slightly above ground)
  // this keeps the car framed in the shot no matter where the camera is
  lookAtTarget.set(0, 0.5, 0);
  camera.lookAt(lookAtTarget);

  renderer.render(scene, camera);
};

animate();
