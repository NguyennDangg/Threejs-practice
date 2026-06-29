import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import GUI from "lil-gui";

// scene setup
const scene = new THREE.Scene();
const gui = new GUI();

const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.enableDamping = true;

// shared telemetry data - the single source of truth
const telemetry = {
  throttle: 0.5,
  rpm: 0.3,
  gear: 3,
  sector1: 2,
  sector2: 1,
  sector3: 0,
};

// reusable backing panel - sit BEHIND a gauge to read as "mounted"
function createPanel(width, height) {
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.6,
  });
  return new THREE.Mesh(geo, mat);
}

// 1. Throttle bar
const throttlePanel = createPanel(1.05, 0.3);
throttlePanel.position.set(-1.0, -0.55, -0.01);
scene.add(throttlePanel);

const throttleGeometry = new THREE.PlaneGeometry(0.9, 0.15);
const throttleMaterial = new THREE.ShaderMaterial({
  uniforms: { u_value: { value: telemetry.throttle } },
  vertexShader: `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float u_value;
    varying vec2 v_uv;
    void main() {
      vec3 trackColor = vec3(0.15);
      float fill = step(v_uv.x, u_value);
      vec3 lowColor = vec3(0.2, 0.9, 0.3);
      vec3 highColor = vec3(0.95, 0.15, 0.1);
      vec3 fillColor = mix(lowColor, highColor, u_value);
      vec3 color = mix(trackColor, fillColor, fill);
      float edge = smoothstep(0.006, 0.0, abs(v_uv.x - u_value)) * fill;
      color += edge * vec3(1.0);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
const throttleMesh = new THREE.Mesh(throttleGeometry, throttleMaterial);
throttleMesh.position.set(-1.0, -0.55, 0);
scene.add(throttleMesh);

// 2. RPM arc
const rpmPanel = createPanel(1.3, 1.3);
rpmPanel.position.set(0.5, -0.1, -0.01);
scene.add(rpmPanel);

const rpmGeometry = new THREE.PlaneGeometry(0.9, 0.9);
const rpmMaterial = new THREE.ShaderMaterial({
  uniforms: { u_value: { value: telemetry.rpm } },
  vertexShader: `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float u_value;
    varying vec2 v_uv;
    void main() {
      vec2 center = vec2(0.5);
      vec2 p = v_uv - center;
      float d = distance(v_uv, center);
      float angle = atan(p.y, p.x);
      float shiftedAngle = angle + 3.14159 * 0.5;
      shiftedAngle = mod(shiftedAngle, 6.28318);
      float normalizedAngle = shiftedAngle / 6.28318;
      float dialRange = 0.75;
      float gaugeProgress = normalizedAngle / dialRange;
      float inRange = step(normalizedAngle, dialRange);
      float outerEdge = smoothstep(0.46, 0.44, d);
      float innerEdge = smoothstep(0.34, 0.36, d);
      float ring = outerEdge * innerEdge;
      float fill = step(gaugeProgress, u_value) * inRange;
      vec3 trackColor = vec3(0.15);
      vec3 lowColor = vec3(0.2, 0.9, 0.3);
      vec3 highColor = vec3(0.95, 0.15, 0.1);
      vec3 fillColor = mix(lowColor, highColor, u_value);
      vec3 color = mix(trackColor, fillColor, fill) * ring * inRange;
      gl_FragColor = vec4(color, ring);
    }
  `,
  transparent: true,
});
const rpmMesh = new THREE.Mesh(rpmGeometry, rpmMaterial);
rpmMesh.position.set(0.5, -0.1, 0);
rpmMesh.scale.set(1.1, 1.1, 1);
scene.add(rpmMesh);

// 3. Gear indicator - sits centered inside the RPM ring
const gearCanvas = document.createElement("canvas");
gearCanvas.width = 256;
gearCanvas.height = 256;
const gearCtx = gearCanvas.getContext("2d");

function drawGear(gearNumber) {
  gearCtx.clearRect(0, 0, gearCanvas.width, gearCanvas.height);
  gearCtx.fillStyle = "#000";
  gearCtx.fillRect(0, 0, gearCanvas.width, gearCanvas.height);
  gearCtx.fillStyle = "#fff";
  gearCtx.font = "bold 150px sans-serif";
  gearCtx.textAlign = "center";
  gearCtx.textBaseline = "middle";
  gearCtx.fillText(
    gearNumber.toString(),
    gearCanvas.width / 2,
    gearCanvas.height / 2 + 10,
  );
  gearTexture.needsUpdate = true;
}

const gearTexture = new THREE.CanvasTexture(gearCanvas);
drawGear(telemetry.gear);

const gearGeometry = new THREE.PlaneGeometry(0.5, 0.5);
const gearMaterial = new THREE.ShaderMaterial({
  uniforms: {
    u_rpm: { value: telemetry.rpm },
    u_time: { value: 0.0 },
    u_texture: { value: gearTexture },
  },
  vertexShader: `
    varying vec2 v_uv;
    void main() {
      v_uv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float u_rpm;
    uniform float u_time;
    uniform sampler2D u_texture;
    varying vec2 v_uv;
    void main() {
      vec4 texColor = texture2D(u_texture, v_uv);
      vec3 normalColor = vec3(1.0);
      vec3 redlineColor = vec3(1.0, 0.2, 0.15);
      float redlineThreshold = smoothstep(0.8, 1.0, u_rpm);
      float flash = sin(u_time * 12.0) * 0.5 + 0.5;
      float flashAmount = flash * redlineThreshold;
      vec3 gearColor = mix(normalColor, redlineColor, redlineThreshold);
      gearColor = mix(gearColor, vec3(1.0), flashAmount * 0.6);
      gl_FragColor = vec4(texColor.rgb * gearColor, texColor.r);
    }
  `,
  transparent: true,
});
const gearMesh = new THREE.Mesh(gearGeometry, gearMaterial);
// matches the RPM ring's new position — keeps the gear nested visually inside it
gearMesh.position.set(0.5, -0.1, 0.01);
scene.add(gearMesh);

// 4. Sector bars
const sectorPanel = createPanel(1.25, 0.3);
sectorPanel.position.set(-0.3, 0.6, -0.01);
scene.add(sectorPanel);

const sectorGeometry = new THREE.PlaneGeometry(1.1, 0.18);
const sectorMaterial = new THREE.ShaderMaterial({
  uniforms: {
    u_time: { value: 0.0 },
    u_sectors: {
      value: new THREE.Vector3(
        telemetry.sector1,
        telemetry.sector2,
        telemetry.sector3,
      ),
    },
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

    vec3 sectorColor(float status) {
      vec3 pending = vec3(0.2);
      vec3 activeColor = vec3(0.95, 0.85, 0.1);
      vec3 complete = vec3(0.2, 0.9, 0.3);
      float isActiveOrHigher = step(0.5, status);
      float isCompleteOnly = step(1.5, status);
      vec3 color = pending;
      color = mix(color, activeColor, isActiveOrHigher);
      color = mix(color, complete, isCompleteOnly);
      return color;
    }

    void main() {
      float segmentIndex = floor(v_uv.x * 3.0);
      float status = 0.0;
      if (segmentIndex < 0.5) status = u_sectors.x;
      else if (segmentIndex < 1.5) status = u_sectors.y;
      else status = u_sectors.z;

      vec3 color = sectorColor(status);

      float isActive = step(0.5, status) * (1.0 - step(1.5, status));
      float pulse = sin(u_time * 6.0) * 0.5 + 0.5;
      color = mix(color, vec3(1.0), isActive * pulse * 0.3);

      float gapWidth = 0.015;
      float localX = fract(v_uv.x * 3.0);
      float gap = step(gapWidth, localX) * step(localX, 1.0 - gapWidth);

      gl_FragColor = vec4(color * gap, 1.0);
    }
  `,
});
const sectorMesh = new THREE.Mesh(sectorGeometry, sectorMaterial);
sectorMesh.position.set(-0.3, 0.6, 0);
scene.add(sectorMesh);

// one function syncing all gauges from the shared telemetry object
function updateTelemetry() {
  throttleMaterial.uniforms.u_value.value = telemetry.throttle;
  rpmMaterial.uniforms.u_value.value = telemetry.rpm;
  gearMaterial.uniforms.u_rpm.value = telemetry.rpm;
  sectorMaterial.uniforms.u_sectors.value.set(
    telemetry.sector1,
    telemetry.sector2,
    telemetry.sector3,
  );
}

// GUI - one panel, controls the shared data, every gauge reacts together (all in one)
gui
  .add(telemetry, "throttle", 0, 1, 0.01)
  .name("Throttle %")
  .onChange(updateTelemetry);
gui.add(telemetry, "rpm", 0, 1, 0.01).name("RPM %").onChange(updateTelemetry);
gui
  .add(telemetry, "gear", 1, 8, 1)
  .name("Gear")
  .onChange((val) => {
    telemetry.gear = val;
    drawGear(val);
    updateTelemetry();
  });

const statusOptions = { Pending: 0, Active: 1, Complete: 2 };
gui
  .add(telemetry, "sector1", statusOptions)
  .name("Sector 1")
  .onChange(updateTelemetry);
gui
  .add(telemetry, "sector2", statusOptions)
  .name("Sector 2")
  .onChange(updateTelemetry);
gui
  .add(telemetry, "sector3", statusOptions)
  .name("Sector 3")
  .onChange(updateTelemetry);

// resize - fixed: keep the 1.6 scale factor instead of cancelling it out
window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -1.6 * aspect;
  camera.right = 1.6 * aspect;
  camera.top = 1;
  camera.bottom = -1;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// animate
const startTime = performance.now();
const animate = () => {
  requestAnimationFrame(animate);
  const elapsed = (performance.now() - startTime) / 1000;
  gearMaterial.uniforms.u_time.value = elapsed;
  sectorMaterial.uniforms.u_time.value = elapsed;
  controls.update();
  renderer.render(scene, camera);
};

animate();
