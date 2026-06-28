import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import GUI from "lil-gui";

const scene = new THREE.Scene();
const gui = new GUI();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enableDamping = true;

const geometry = new THREE.PlaneGeometry(1.5, 0.25);

// 0 = pending (grey), 1 = active (yellow, pulsing), 2 = complete (green)
const sectorState = { sector1: 2, sector2: 1, sector3: 0 };

const material = new THREE.ShaderMaterial({
  uniforms: {
    u_time: { value: 0.0 },
    // array uniform - one status value per sector, sent as a vec3
    u_sectors: { value: new THREE.Vector3(2, 1, 0) },
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
    uniform vec3 u_sectors;
    varying vec2 v_uv;

    // returns the color for a single sector, given its status (0, 1, or 2)
    vec3 sectorColor(float status) {
      vec3 pending = vec3(0.2);          // dim grey
      vec3 activeColor  = vec3(0.95, 0.85, 0.1); // yellow
      vec3 complete = vec3(0.2, 0.9, 0.3);  // green

      // step-based selection: only ONE of these three branches contributes
      // step(0.5, status) = 1.0 if status >= 1, else 0.0 - same trick as 06b
      float isActiveOrHigher = step(0.5, status);
      float isCompleteOnly = step(1.5, status);

      vec3 color = pending;
      color = mix(color, activeColor, isActiveOrHigher);
      color = mix(color, complete, isCompleteOnly);
      return color;
    }

    void main() {
      // split the bar into 3 equal horizontal segments
      // floor(v_uv.x * 3.0) gives 0.0 for the first third, 1.0 for the middle, 2.0 for the last
      float segmentIndex = floor(v_uv.x * 3.0);

      // pick which sector's status value applies to THIS pixel
      float status = 0.0;
      if (segmentIndex < 0.5) status = u_sectors.x;
      else if (segmentIndex < 1.5) status = u_sectors.y;
      else status = u_sectors.z;

      vec3 color = sectorColor(status);

      // pulse ACTIVE sectors only - same gating trick from the gear indicator
      float isActive = step(0.5, status) * (1.0 - step(1.5, status));
      float pulse = sin(u_time * 6.0) * 0.5 + 0.5;
      color = mix(color, vec3(1.0), isActive * pulse * 0.3);

      // thin dark gap between segments so they read as distinct blocks
      float gapWidth = 0.015;
      float localX = fract(v_uv.x * 3.0); // position within the current segment, 0–1
      float gap = step(gapWidth, localX) * step(localX, 1.0 - gapWidth);

      gl_FragColor = vec4(color * gap, 1.0);
    }
  `,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// GUI - one dropdown-style control per sector
const statusOptions = { Pending: 0, Active: 1, Complete: 2 };

gui
  .add(sectorState, "sector1", statusOptions)
  .name("Sector 1")
  .onChange(updateSectors);
gui
  .add(sectorState, "sector2", statusOptions)
  .name("Sector 2")
  .onChange(updateSectors);
gui
  .add(sectorState, "sector3", statusOptions)
  .name("Sector 3")
  .onChange(updateSectors);

function updateSectors() {
  material.uniforms.u_sectors.value.set(
    sectorState.sector1,
    sectorState.sector2,
    sectorState.sector3,
  );
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const startTime = performance.now();
const animate = () => {
  requestAnimationFrame(animate);
  material.uniforms.u_time.value = (performance.now() - startTime) / 1000;
  controls.update();
  renderer.render(scene, camera);
};

animate();