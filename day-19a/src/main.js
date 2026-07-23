import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

// lighting
scene.add(new THREE.AmbientLight(0x334455, 5));
const dirLight = new THREE.DirectionalLight(0xffddaa, 6);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.3,
    metalness: 0.5,
  }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// GLTF model - now also collecting meshes so I can raycast against them
const carMeshes = [];
const loader = new GLTFLoader();
loader.load("/assets/RB20.glb", (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += size.y / 2;

  // collect every mesh for hover detection (materials stay untouched -
  // the car keeps its real paint, I only change how it's RENDERED)
  model.traverse((child) => {
    if (child.isMesh) carMeshes.push(child);
  });

  scene.add(model);
});

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const pixelateShader = {
  uniforms: {
    tDiffuse: { value: null },
    u_resolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    u_pixelSize: { value: 14.0 }, // chunkiness at full strength
    u_mouse: { value: new THREE.Vector2(0.5, 0.5) }, // cursor in 0..1 uv
    u_hover: { value: 0 }, // 0 = not on car, 1 = on car (eased)
    u_radius: { value: 0.26 }, // how wide the corruption spreads
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
    uniform vec2 u_resolution;
    uniform float u_pixelSize;
    uniform vec2 u_mouse;
    uniform float u_hover;
    uniform float u_radius;
    varying vec2 vUv;

    void main() {
      // ONE fixed grid for everyone - this is what kills the rings
      vec2 pixelCoord = vUv * u_resolution;
      vec2 cell = floor(pixelCoord / u_pixelSize);
      vec2 pixelUv = (cell * u_pixelSize) / u_resolution;

      // measure distance from the CELL CENTRE (not the raw pixel) so the
      // edge of the effect is blocky too, not a smooth circle
      vec2 cellCentreUv = (cell * u_pixelSize + u_pixelSize * 0.5) / u_resolution;
      vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
      float d = distance(cellCentreUv * aspect, u_mouse * aspect);

      float strength = smoothstep(u_radius, 0.0, d) * u_hover;

      // blend between the sharp image and the chunky one
      vec4 sharp  = texture2D(tDiffuse, vUv);
      vec4 chunky = texture2D(tDiffuse, pixelUv);

      gl_FragColor = mix(sharp, chunky, strength);
    }
  `,
};

const pixelatePass = new ShaderPass(pixelateShader);
composer.addPass(pixelatePass);

// raycasting: is the cursor over the car?
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(-10, -10); // -1..1, for the raycaster
const pointerUV = new THREE.Vector2(0.5, 0.5); // 0..1, for the shader
let hoverTarget = 0;
let hoverSmooth = 0;

window.addEventListener("pointermove", (e) => {
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerUV.x = e.clientX / window.innerWidth;
  pointerUV.y = 1.0 - e.clientY / window.innerHeight; // flip: GL y is up
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  pixelatePass.uniforms.u_resolution.value.set(
    window.innerWidth,
    window.innerHeight,
  );
});

const startTime = performance.now();
let lastTime = startTime;

const animate = () => {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // is the cursor over the car right now?
  if (carMeshes.length) {
    raycaster.setFromCamera(pointerNDC, camera);
    hoverTarget =
      raycaster.intersectObjects(carMeshes, false).length > 0 ? 1 : 0;
  }

  // ease it so the corruption swells in and settles out
  hoverSmooth += (hoverTarget - hoverSmooth) * (1 - Math.exp(-8 * dt));

  pixelatePass.uniforms.u_hover.value = hoverSmooth;
  pixelatePass.uniforms.u_mouse.value.copy(pointerUV);

  controls.update();
  composer.render();
};

animate();
