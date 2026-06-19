import "./style.css";
import * as THREE from "three";
import {
  OrbitControls,
  GLTFLoader,
  HDRLoader,
} from "three/examples/jsm/Addons.js";
import GUI from "lil-gui";

// Scene
const scene = new THREE.Scene();

// set up on top for clean code and global visibility
const gui = new GUI();

// Camera
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
// smooth operating for every monitors
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; // render supports shadows
renderer.shadowMap.type = THREE.PCFShadowMap; // Updated to non-deprecated modern soft shadow standard
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Physical weight to camera panning
controls.minDistance = 3;
controls.maxDistance = 20;
controls.target.set(0, 0.5, 0); // Focuses orbital rotation around the vehicle center rather than the ground plane

// HDR Environment
// HDRLoader replaces the deprecated RGBELoader (r179+)
const hdrLoader = new HDRLoader();
hdrLoader.load("/assets/studio_lighting.hdr", (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping; // Wraps panoramic image seamlessly as a 360 sphere
  scene.background = texture; // use HDR file as background
  scene.environment = texture; // Lights and Reflects off everything
});

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.8,
    metalness: 0.2,
  }),
);
ground.rotation.x = -Math.PI / 2; // Rotates geometry flat onto the XZ ground plane
ground.receiveShadow = true; // the surface that receives shadows
scene.add(ground);

// Directional Light (for shadows — HDR alone doesn't cast them)
// HDR environments provide realistic ambient reflections but lack a directional source to project sharp contact shadows.
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true; // this light cast the shadows
scene.add(dirLight);

// GLTF Model — the RB20
const loader = new GLTFLoader();
let model; // keep a reference so the GUI can control it later
// using let here so the model stays accesible after loading finishes

loader.load(
  "/assets/RB20.glb",
  (gltf) => {
    model = gltf.scene;
    model.scale.set(1, 1, 1);

    // Deep object traversal to map shadow projection configurations across all child geometries
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true; // the object casts shadows
        child.receiveShadow = true;
      }
    });

    // Auto-center and ground the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center); // model centered
    model.position.y += size.y / 2; // then lift it up by half its height

    console.log("Model size:", size); // check this if scale looks off

    scene.add(model);

    // lil-gui controls for the model
    // custom slider object to handle uniform 3D scalar updates
    const modelFolder = gui.addFolder("Model");
    modelFolder.add(model.rotation, "y", 0, Math.PI * 2).name("rotate Y");
    modelFolder
      .add(model.scale, "x", 0.1, 3)
      .name("scale")
      .onChange((val) => {
        model.scale.set(val, val, val);
      });
    modelFolder.open();
  },
  (progress) => {
    if (progress.total > 0) {
      console.log(
        `Loading: ${Math.round((progress.loaded / progress.total) * 100)}%`,
      );
    }
  },
  (error) => {
    console.error("Model failed to load:", error);
  },
);

// lil-gui
// Lighting control 
const lightFolder = gui.addFolder("Directional Light");
lightFolder.add(dirLight, "intensity", 0, 10);
lightFolder.add(dirLight.position, "x", -20, 20);
lightFolder.add(dirLight.position, "y", -20, 20);
lightFolder.add(dirLight.position, "z", -20, 20);
lightFolder.open();

const rendererFolder = gui.addFolder("Renderer");
rendererFolder.add(renderer, "toneMappingExposure", 0, 3).name("exposure");
rendererFolder.open();

// Resize (responsive)
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
