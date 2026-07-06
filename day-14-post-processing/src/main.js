import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

// post-processing imports
// these all live inside three/examples/jsm/postprocessing/
// no extra npm install needed — they ship with three
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050810);
scene.fog = new THREE.FogExp2(0x050810, 0.04);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

// lighting
const ambientLight = new THREE.AmbientLight(0x223344, 1);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xaaccff, 2);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// accent lights — these will bloom
const blueLight = new THREE.PointLight(0x4488ff, 30);
blueLight.position.set(-4, 2, 3);
scene.add(blueLight);

const redLight = new THREE.PointLight(0xff2200, 20);
redLight.position.set(4, 1, -3);
scene.add(redLight);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.1,
    metalness: 0.8,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// emissive objects - these are what bloom actually affects
// bloom amplifies bright/emissive surfaces into a glow
// objects with emissive color will appear to radiate light

// glowing accent orbs - pure emissive, no lighting reaction
const orbGeometry = new THREE.SphereGeometry(0.15, 16, 16);

const blueOrb = new THREE.Mesh(
  orbGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0x4488ff,
    emissiveIntensity: 5, // high intensity = strong bloom
  }),
);
blueOrb.position.set(-4, 2, 3);
scene.add(blueOrb);

const redOrb = new THREE.Mesh(
  orbGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xff2200,
    emissiveIntensity: 5,
  }),
);
redOrb.position.set(4, 1, -3);
scene.add(redOrb);

// glowing ring — like a data halo around the car
const ringGeometry = new THREE.TorusGeometry(3, 0.02, 8, 100);
const ringMaterial = new THREE.MeshStandardMaterial({
  color: 0x000000,
  emissive: 0x0044ff,
  emissiveIntensity: 3,
});
const ring = new THREE.Mesh(ringGeometry, ringMaterial);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.05;
scene.add(ring);

// GLTF model
const loader = new GLTFLoader();
loader.load(
  "/assets/RB20.glb",
  (gltf) => {
    const model = gltf.scene;
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
  },
  undefined,
  (err) => console.error("Model failed:", err),
);

// post-processing pipeline
// Without post-processing: renderer.render(scene, camera) -> screen
// With post-processing:    renderer.render(scene, camera) ->. texture
//                          -> pass1 -> pass2 -> pass3 -> screen
// EffectComposer manages this chain of passes

const composer = new EffectComposer(renderer);

// renderPass - renders the scene into a texture (not the screen)
// this is always the FIRST pass - it creates the base image
// every subsequent pass reads and modifies that image
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// UnrealBloomPass - adds glow around bright/emissive surfaces
// args: resolution, strength, radius, threshold
// threshold: only pixels brighter than this value bloom
//   0.0 = everything blooms, 1.0 = only the very brightest
// strength: how intense the glow is
// radius: how far the glow spreads
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.2, // strength
  0.6, // radius
  0.2, // threshold - low threshold so emissive materials bloom easily
);
composer.addPass(bloomPass);

// ShaderPass with a custom shader - chromatic aberration + film grain
// ShaderPass lets you write any GLSL and apply it as a post-process step
// it receives the previous pass's output as a texture called 'tDiffuse'
const chromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null }, // automatically set by ShaderPass - the previous pass output
    u_time: { value: 0 },
    u_aberrationStrength: { value: 0.003 }, // how far RGB channels separate
    u_grainStrength: { value: 0.04 }, // film grain intensity
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
    uniform float u_time;
    uniform float u_aberrationStrength;
    uniform float u_grainStrength;
    varying vec2 vUv;

    // fast hash for grain - same concept as Day 06 random()
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;

      // chromatic aberration
      // a real camera lens bends different colors (wavelengths) by different amounts
      // red channel gets sampled from a slightly offset UV position
      // green stays centered
      // blue gets sampled from the opposite offset
      // result: color fringing at high-contrast edges, like an old lens
      vec2 offset = (uv - 0.5) * u_aberrationStrength;

      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;

      // film grain
      // random noise that changes every frame (u_time drives it)
      // subtracted slightly from the final color
      // makes the image feel like it was captured on a real camera
      float grain = hash(uv + fract(u_time * 0.1)) * u_grainStrength;

      vec3 color = vec3(r, g, b) - grain;

      // vignette
      // darkens the edges of the screen, draws the eye to center
      // same math as your 06e vignette from the crystal shader
      float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
      vignette = clamp(pow(vignette * 16.0, 0.4), 0.0, 1.0);
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

const chromaticPass = new ShaderPass(chromaticAberrationShader);
composer.addPass(chromaticPass);

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // composer needs resizing too - it has its own internal render targets
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

// animate
const startTime = performance.now();

const animate = () => {
  requestAnimationFrame(animate);

  const t = (performance.now() - startTime) / 1000;

  // animate the ring rotation
  ring.rotation.z = t * 0.3;

  // pulse the emissive intensity on the orbs
  blueOrb.material.emissiveIntensity = 3 + Math.sin(t * 2) * 2;
  redOrb.material.emissiveIntensity = 3 + Math.sin(t * 2 + Math.PI) * 2;

  // update the time uniform for grain animation
  chromaticPass.uniforms.u_time.value = t;

  controls.update();

  // IMPORTANT: use composer.render() instead of renderer.render()
  // composer runs the full pass chain and outputs to screen
  composer.render();
};

animate();
