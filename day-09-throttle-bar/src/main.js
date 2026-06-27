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
controls.enableRotate = false; // HUD elements shouldn't tumble in 3D - lock rotation
controls.enableDamping = true;

const geometry = new THREE.PlaneGeometry(1.2, 0.2);

const material = new THREE.ShaderMaterial({
  uniforms: {
    u_value: { value: 0.0 }, // 0.0 = empty, 1.0 = full throttle
  },
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
      // background track — dim grey, always visible
      vec3 trackColor = vec3(0.15);

      // step() draws a hard fill line at u_value across the bar's width
      // anything to the LEFT of u_value is "filled" (1.0), right is empty (0.0)
      float fill = step(v_uv.x, u_value);

      // color shifts based on how close u_value is to full throttle
      // mix() blends green → yellow → red, same trick as your crystal's palette
      vec3 lowColor = vec3(0.2, 0.9, 0.3);   // green
      vec3 highColor = vec3(0.95, 0.15, 0.1); // red
      vec3 fillColor = mix(lowColor, highColor, u_value);

      vec3 color = mix(trackColor, fillColor, fill);

      // thin bright edge right at the fill line — sells the "gauge" feel
      float edge = smoothstep(0.004, 0.0, abs(v_uv.x - u_value)) * fill;
      color += edge * vec3(1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// GUI - stand-in for real telemetry data
gui.add(material.uniforms.u_value, "value", 0, 1, 0.01).name("throttle %");

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

animate();
