import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// two separate scenes
// scene A - dry garage, warm red/orange lighting
const sceneA = new THREE.Scene();
sceneA.background = new THREE.Color(0x0a0805);
sceneA.fog = new THREE.FogExp2(0x0a0805, 0.04);

// scene B - rain/night, cold blue lighting
const sceneB = new THREE.Scene();
sceneB.background = new THREE.Color(0x050810);
sceneB.fog = new THREE.FogExp2(0x050810, 0.06);

let currentScene = sceneA; // which scene is currently active

// camera - shared between both scenes
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2, 8);

// renderer
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

// scene A - warm garage setup
const ambientA = new THREE.AmbientLight(0xffffff, 2);
sceneA.add(ambientA);

const dirLightA = new THREE.DirectionalLight(0xffaa44, 2);
dirLightA.position.set(5, 10, 5);
dirLightA.castShadow = true;
sceneA.add(dirLightA);

const redLight = new THREE.PointLight(0xff4400, 40);
redLight.position.set(-3, 2, 3);
sceneA.add(redLight);

const groundA = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x1a1208,
    roughness: 0.8,
    metalness: 0.2,
  }),
);
groundA.rotation.x = -Math.PI / 2;
groundA.receiveShadow = true;
sceneA.add(groundA);

// warm emissive ring
const ringA = new THREE.Mesh(
  new THREE.TorusGeometry(3, 0.02, 8, 100),
  new THREE.MeshStandardMaterial({
    emissive: 0xff4400,
    emissiveIntensity: 3,
    color: 0x000000,
  }),
);
ringA.rotation.x = -Math.PI / 2;
ringA.position.y = 0.05;
sceneA.add(ringA);

// scene B - rain/night setup
const ambientB = new THREE.AmbientLight(0x112233, 2);
sceneB.add(ambientB);

const dirLightB = new THREE.DirectionalLight(0x4488ff, 2);
dirLightB.position.set(-5, 10, -3);
dirLightB.castShadow = true;
sceneB.add(dirLightB);

const blueLight = new THREE.PointLight(0x0044ff, 40);
blueLight.position.set(3, 2, -3);
sceneB.add(blueLight);

const groundB = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.1,
    metalness: 0.8,
  }),
);
groundB.rotation.x = -Math.PI / 2;
groundB.receiveShadow = true;
sceneB.add(groundB);

// cold emissive ring
const ringB = new THREE.Mesh(
  new THREE.TorusGeometry(3, 0.02, 8, 100),
  new THREE.MeshStandardMaterial({
    emissive: 0x0044ff,
    emissiveIntensity: 3,
    color: 0x000000,
  }),
);
ringB.rotation.x = -Math.PI / 2;
ringB.position.y = 0.05;
sceneB.add(ringB);

// rain particles in scene B
const PARTICLE_COUNT = 8000;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const seeds = new Float32Array(PARTICLE_COUNT);
const speeds = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 20;
  positions[i * 3 + 1] = Math.random() * 12;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  seeds[i] = Math.random();
  speeds[i] = 0.5 + Math.random() * 0.5;
}

particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
particleGeo.setAttribute("a_seed", new THREE.BufferAttribute(seeds, 1));
particleGeo.setAttribute("a_speed", new THREE.BufferAttribute(speeds, 1));

const rainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    u_time: { value: 0 },
    u_rainColor: { value: new THREE.Color(0x8899bb) },
  },
  vertexShader: `
    attribute float a_seed;
    attribute float a_speed;
    uniform float u_time;
    varying float v_alpha;
    void main() {
      vec3 pos = position;
      float fall = mod(pos.y - u_time * a_speed * 4.0, 12.0);
      pos.y = fall;
      pos.x += sin(u_time * 0.5 + a_seed * 6.28318) * 0.08;
      pos.z += cos(u_time * 0.4 + a_seed * 6.28318) * 0.05;
      v_alpha = smoothstep(0.0, 1.5, fall) * 0.6;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = (1.5 / -mvPosition.z) * 300.0;
    }
  `,
  fragmentShader: `
    uniform vec3 u_rainColor;
    varying float v_alpha;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float drop = length(vec2(uv.x * 12.0, uv.y * 0.8));
      float alpha = smoothstep(0.5, 0.2, drop) * v_alpha;
      gl_FragColor = vec4(u_rainColor, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

sceneB.add(new THREE.Points(particleGeo, rainMaterial));

// load GLTF into both scenes
const loader = new GLTFLoader();

function loadModelIntoScene(targetScene, callback) {
  loader.load("/assets/RB20.glb", (gltf) => {
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
    targetScene.add(model);
    if (callback) callback(size);
  });
}

loadModelIntoScene(sceneA);
loadModelIntoScene(sceneB);

// post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(currentScene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.8,
  0.4,
  0.4,
);
composer.addPass(bloomPass);

// Noise wipe transition shader
// This is the core of Day 15 - a ShaderPass that reads the
// current rendered frame and applies a noise-based reveal/hide
// using the same noise function from Day 06
const transitionShader = {
  uniforms: {
    tDiffuse: { value: null }, // current scene render
    tNext: { value: null }, // next scene render target
    u_progress: { value: 0.0 }, // 0 = current scene, 1 = next scene
    u_time: { value: 0.0 },
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
    uniform sampler2D tNext;
    uniform float u_progress;
    uniform float u_time;
    varying vec2 vUv;

    // noise functions from Day 06
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      // sample noise at multiple scales for a more organic wipe edge
      float n = noise(vUv * 4.0) * 0.5
              + noise(vUv * 8.0) * 0.3
              + noise(vUv * 16.0) * 0.2;

      // threshold moves from -0.3 to 1.3 as progress goes 0→1
      // the extra range (-0.3 and 1.3) ensures full coverage at edges
      float threshold = u_progress * 1.6 - 0.3;

      // smoothstep creates a soft edge on the wipe boundary
      // instead of a hard cutoff, pixels near the threshold fade
      float wipe = smoothstep(threshold, threshold + 0.1, n);

      vec4 colorA = texture2D(tDiffuse, vUv); // current scene
      vec4 colorB = texture2D(tNext, vUv);    // next scene

      // mix between scenes based on the noise wipe mask
      gl_FragColor = mix(colorA, colorB, wipe);
    }
  `,
};

// separate render target for the next scene
// RenderTarget = a texture you can render into instead of the screen
const nextSceneTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
);

const transitionPass = new ShaderPass(transitionShader);
composer.addPass(transitionPass);

// transition state
let isTransitioning = false;
let transitionProgress = 0;
let transitionDirection = 1; // 1 = A→B, -1 = B→A

document.getElementById("trigger").addEventListener("click", () => {
  if (isTransitioning) return; // ignore clicks mid-transition
  isTransitioning = true;
  transitionDirection = currentScene === sceneA ? 1 : -1;
});

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  nextSceneTarget.setSize(window.innerWidth, window.innerHeight);
});

// animate
const startTime = performance.now();

const animate = () => {
  requestAnimationFrame(animate);

  const t = (performance.now() - startTime) / 1000;

  // update rain time
  rainMaterial.uniforms.u_time.value = t;

  // animate rings
  ringA.rotation.z = t * 0.2;
  ringB.rotation.z = t * 0.3;

  // handle transition progress
  if (isTransitioning) {
    transitionProgress += 0.02; // speed of wipe - increase for faster transition

    if (transitionProgress >= 1) {
      // transition complete - swap scenes, reset progress
      transitionProgress = 0;
      isTransitioning = false;
      currentScene = currentScene === sceneA ? sceneB : sceneA;
      renderPass.scene = currentScene; // tell the render pass which scene is active
      transitionPass.uniforms.u_progress.value = 0;
    } else {
      transitionPass.uniforms.u_progress.value = transitionProgress;
    }
  }

  // always render the "next" scene into the render target
  // so the transition shader always has both scenes available
  const nextScene = currentScene === sceneA ? sceneB : sceneA;
  renderer.setRenderTarget(nextSceneTarget);
  renderer.render(nextScene, camera);
  renderer.setRenderTarget(null); // reset to screen

  // hand the next scene texture to the transition shader
  transitionPass.uniforms.tNext.value = nextSceneTarget.texture;
  transitionPass.uniforms.u_time.value = t;

  controls.update();
  composer.render();
};

animate();
