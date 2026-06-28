import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import GUI from "lil-gui";

// scene - initial setup
const scene = new THREE.Scene();
const gui = new GUI();

// Using an Orthographic camera for a 2D flat user interface display
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false; // locked rotation for a 2D UI plane
controls.enableDamping = true;

// dynamic canvas texture for gear numbers
const gearCanvas = document.createElement("canvas");
gearCanvas.width = 256;
gearCanvas.height = 256;
const ctx = gearCanvas.getContext("2d");

// redraws the 2D canvas whenever the active gear changes
function drawGear(gearNumber) {
  ctx.clearRect(0, 0, gearCanvas.width, gearCanvas.height);

  // Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, gearCanvas.width, gearCanvas.height);

  // Text stylings
  ctx.fillStyle = "#fff";
  ctx.font = "bold 180px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    gearNumber.toString(),
    gearCanvas.width / 2,
    gearCanvas.height / 2 + 10,
  );

  // tell Three.js the canvas changed so it re-uploads the texture data to the GPU
  gearTexture.needsUpdate = true;
}

const gearTexture = new THREE.CanvasTexture(gearCanvas);
drawGear(3); // Initialize with 3rd gear active

// mesh - custom shader material
const geometry = new THREE.PlaneGeometry(1, 1);

const material = new THREE.ShaderMaterial({
  uniforms: {
    u_rpm: { value: 0.0 }, // controls color shifting and gating the flash effect
    u_time: { value: 0.0 }, // drives the periodic sine wave flash animation
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
      // sample the texture color from our generated canvas
      vec4 texColor = texture2D(u_texture, v_uv);

      // define standard and high-RPM (redline) colors
      vec3 normalColor = vec3(1.0);
      vec3 redlineColor = vec3(1.0, 0.2, 0.15);

      // only begin shifting color in the last 20% of the RPM range (0.8 -> 1.0)
      // change the first number to make it fire faster (eg: 0.6)
      float redlineThreshold = smoothstep(0.8, 1.0, u_rpm);

      // create a rapid pulsing oscillation using time (mapped from -1->1 to 0->1)
      // change the number that u_time interact with to make it flash faster or slower (eg: 20.0)
      float flash = sin(u_time * 12.0) * 0.5 + 0.5;

      // multiply flash by the threshold. If RPM is low (< 80%), redlineThreshold is 0
      // which safely mutes the flashing effect completely.
      float flashAmount = flash * redlineThreshold;

      // blend normal color into redline color based on our threshold scale
      vec3 gearColor = mix(normalColor, redlineColor, redlineThreshold);
      
      // inject an extra boost of brightness during the peak of the flash cycle
      // visual intensity of the flash
      gearColor += flashAmount * 0.4;
      
      // this blends toward pure white at the flash peak instead of just adding brightness
      // gearColor = mix(gearColor, vec3(1.0), flashAmount * 0.6);

      // output color, uses the red channel of the text canvas as the transparency mask.
      gl_FragColor = vec4(texColor.rgb * gearColor, texColor.r);
    }
  `,
  transparent: true,
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// user interface (GUI)
const gearState = { gear: 3 };
gui
  .add(gearState, "gear", 1, 8, 1)
  .name("Gear")
  .onChange((val) => {
    drawGear(val);
  });
gui.add(material.uniforms.u_rpm, "value", 0, 1, 0.01).name("RPM % (for color)");

// window resizing handler
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// animation loop
const startTime = performance.now();

const animate = () => {
  requestAnimationFrame(animate);

  // calculate elapsed time in seconds and pass it to the fragment shader
  material.uniforms.u_time.value = (performance.now() - startTime) / 1000;

  controls.update();
  renderer.render(scene, camera);
};

animate();
