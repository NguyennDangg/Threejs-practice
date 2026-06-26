import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";

// scene setup - identical to every day so far
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ShaderMaterial - my 06d pulsing circle, now living on a real mesh
const geometry = new THREE.PlaneGeometry(2, 2);

const material = new THREE.ShaderMaterial({
  side: THREE.DoubleSide, // render both front and back faces (FrontSide and BackSide also exist)
  uniforms: {
    u_time: { value: 0 },
  },
  vertexShader: `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float u_time;
    varying vec2 v_uv;

    void main() {
      vec2 st = v_uv;
      float d = distance(st, vec2(0.5));
      float radius = 0.3 + sin(u_time) * 0.05;
      float circle = smoothstep(radius, radius + 0.01, d);
      gl_FragColor = vec4(vec3(1.0 - circle), 1.0);
    }
  `,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// animate - performance.now() based, no clock or timer dependency needed
let rafId;
const startTime = performance.now();

const animate = () => {
  rafId = requestAnimationFrame(animate);
  material.uniforms.u_time.value = (performance.now() - startTime) / 1000;
  controls.update();
  renderer.render(scene, camera);
};

animate();
