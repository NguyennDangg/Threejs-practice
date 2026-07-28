// day-21 - environment maps + floating-on-shadow presentation

// The premium car-render look: the car sits in pure darkness, lit and
// reflective from an invisible environment map, casting a soft shadow
// onto an INVISIBLE floor, grounded, but floating in black
//
// Three independent switches make this work:
// scene.background = dark color
// scene.environment = env map - what the car REFLECTS (invisible)
// ShadowMaterial floor - a floor that only exists where the shadow touches it

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/Addons.js";

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f); // dark

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(4, 2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// shadows ON - the invisible floor needs something to catch
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // soft, non-pixelated edges
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.target.set(0, 0.5, 0);

// ENVIRONMENT MAP
//  PMREMGenerator pre-processes the environment into the mip-mapped
//  format materials need for smooth reflections at every roughness
//  I assign it to scene.environment ONLY (not background), so it
//  lights + reflects on the car but stays invisible

const pmrem = new THREE.PMREMGenerator(renderer);
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture; // invisible: reflections + lighting only

// LIGHT (casts the shadow)
// the environment lights the car's SURFACES, but image-based lighting
// doesn't cast a directional shadow - so I add one light purely to
// drop a shadow onto the floor
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048); // crisp shadow
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 40;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.bias = -0.0002; // reduces shadow acne
scene.add(dirLight);

// INVISIBLE SHADOW FLOOR
//  ShadowMaterial is fully transparent EXCEPT where a shadow falls on
//  it, so the car casts a shadow onto "nothing" - grounded, but no
//  visible floor, the trick for dark-themed 3D

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.ShadowMaterial({ opacity: 0.5 }), // only the shadow renders
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);

// MODEL
new GLTFLoader().load("/assets/RB20.glb", (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += size.y / 2; // sit it on the floor (y = 0)

  model.traverse((child) => {
    if (child.isMesh && child.material) {
      child.castShadow = true; // the car drops the shadow
      child.material.envMapIntensity = 1.2; // reflection strength
      // uncomment to force a glossy car-paint look on everything:
      // child.material.metalness = 0.9;
      // child.material.roughness = 0.25;
    }
  });

  scene.add(model);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  renderer.render(scene, camera);
}
frame();
