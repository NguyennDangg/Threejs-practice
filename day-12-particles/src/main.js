import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050810, 0.08);

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
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// lighting
const ambientLight = new THREE.AmbientLight(0x223344, 1.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xaaccff, 1.5);
dirLight.position.set(3, 8, 3);
dirLight.castShadow = true;
scene.add(dirLight);

const groundBounce = new THREE.PointLight(0x4488ff, 15);
groundBounce.position.set(0, -0.5, 2);
scene.add(groundBounce);

// wet ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.1,
    metalness: 0.8,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

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

// Rain particle system
const PARTICLE_COUNT = 15000;

// BufferGeometry stores particle data as flat typed arrays
// much faster than creating 15000 individual Mesh objects
const particleGeometry = new THREE.BufferGeometry();

// each particle needs a position (x, y, z) and a random seed
// the seed gives each particle a unique offset so they don't all move identically
const positions = new Float32Array(PARTICLE_COUNT * 3);
const seeds = new Float32Array(PARTICLE_COUNT); // unique per-particle random value
const speeds = new Float32Array(PARTICLE_COUNT); // unique per-particle fall speed

for (let i = 0; i < PARTICLE_COUNT; i++) {
  positions[i * 3 + 0] = (Math.random() - 0.5) * 20;
  positions[i * 3 + 1] = Math.random() * 12;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  seeds[i] = Math.random();
  speeds[i] = 0.5 + Math.random() * 0.5;
}

particleGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(positions, 3),
);
particleGeometry.setAttribute("a_seed", new THREE.BufferAttribute(seeds, 1));
particleGeometry.setAttribute("a_speed", new THREE.BufferAttribute(speeds, 1));


// rain shader
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

const rain = new THREE.Points(particleGeometry, rainMaterial);
scene.add(rain);

// scroll-driven turntable camera
// instead of a curve, the camera sits on a fixed circle around the car
// scroll progress maps directly to the angle around that circle
let scrollProgress = 0;
let targetScrollProgress = 0;

const RADIUS = 8; // distance from the car
const HEIGHT = 2; // fixed camera height

window.addEventListener("scroll", () => {
  const scrollTop = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  targetScrollProgress = scrollTop / maxScroll; // 0.0 to 1.0
});

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

  // smooth the scroll value - cinematic lag feel
  scrollProgress += (targetScrollProgress - scrollProgress) * 0.05;

  // convert scroll progress to an angle - full scroll = one full rotation
  const angle = scrollProgress * Math.PI * 2;

  // place camera on a circle of fixed radius using sin/cos
  // same circle math as 06a distance/circle shader, just in 3D
  camera.position.x = Math.sin(angle) * RADIUS;
  camera.position.z = Math.cos(angle) * RADIUS;
  camera.position.y = HEIGHT;

  // always look at center
  camera.lookAt(0, 0.5, 0);

  rainMaterial.uniforms.u_time.value = (performance.now() - startTime) / 1000;
  renderer.render(scene, camera);
};

animate();
