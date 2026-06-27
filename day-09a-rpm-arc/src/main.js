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

const geometry = new THREE.PlaneGeometry(1.2, 1.2);

const material = new THREE.ShaderMaterial({
  uniforms: {
    u_value: { value: 0.0 }, // 0.0 = idle, 1.0 = redline
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
      vec2 center = vec2(0.5);
      vec2 p = v_uv - center;

      float d = distance(v_uv, center);
      float angle = atan(p.y, p.x); // -PI to PI, same as your 06c radar

      // Bend the full circle into a 270° dial
      // shift angle so "0" sits at the BOTTOM of the dial (gauge start point)
      // then remap from radians into a clean 0.0–1.0 range
      float shiftedAngle = angle + 3.14159 * 0.5; // rotate so 0 starts at bottom
      shiftedAngle = mod(shiftedAngle, 6.28318);   // wrap into 0–2PI range
      float normalizedAngle = shiftedAngle / 6.28318; // now 0.0 to 1.0

      // only use 75% of the full circle (270° of 360°) - the dial's sweep range
      // the remaining 25% is the "gap" at the top of the gauge
      float dialRange = 0.75;
      float gaugeProgress = normalizedAngle / dialRange;

      // outside the dial's actual sweep range - render nothing (the gap)
      float inRange = step(normalizedAngle, dialRange);

      // ring shape - same outer/inner boundary trick as a torus cross-section
      float outerEdge = smoothstep(0.42, 0.4, d);
      float innerEdge = smoothstep(0.3, 0.32, d);
      float ring = outerEdge * innerEdge;

      // fill the ring up to u_value, same step() trick as the throttle bar
      float fill = step(gaugeProgress, u_value) * inRange;

      vec3 trackColor = vec3(0.15);
      vec3 lowColor = vec3(0.2, 0.9, 0.3);
      vec3 highColor = vec3(0.95, 0.15, 0.1);
      vec3 fillColor = mix(lowColor, highColor, u_value);

      vec3 color = mix(trackColor, fillColor, fill) * ring * inRange;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

gui.add(material.uniforms.u_value, "value", 0, 1, 0.01).name("RPM %");

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
