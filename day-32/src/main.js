import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { initAudioSystem, getAudioData } from "./audio.js";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;

  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  uniform float u_overall;
  uniform vec3 u_color1;
  uniform vec3 u_color2;

  varying vec2 vUv;
  varying vec3 vPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 uv = vUv;
    vec2 center = uv - 0.5;
    float dist = length(center);
    float angle = atan(center.y, center.x);

    // Bass drives radial pulses
    float pulse = sin(dist * 15.0 - u_time * 2.0 + u_bass * 3.0) * 0.5 + 0.5;
    pulse = pow(pulse, 2.0);

    // Mid frequencies create rotating bands
    float bands = sin(angle * 8.0 + u_time + u_mid * 2.0) * 0.5 + 0.5;

    // Treble adds fine noise texture
    float n = noise(uv * 20.0 + u_time * 0.5);
    float trebleNoise = n * u_treble * 0.3;

    // Overall amplitude modulates brightness
    float brightness = u_overall * 0.8 + 0.2;

    float pattern = pulse * 0.5 + bands * 0.3 + trebleNoise;
    pattern *= brightness;

    vec3 color = mix(u_color1, u_color2, pattern);
    color *= (1.0 - dist * 0.6); // vignette
    color += vec3(pulse * u_bass * 0.3);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function initLog32(canvas) {
  // 1. Scene setup
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.z = 3;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 8;

  // 2. Shader Plane setup
  const geometry = new THREE.PlaneGeometry(4, 4, 128, 128);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      u_time: { value: 0 },
      u_bass: { value: 0 },
      u_mid: { value: 0 },
      u_treble: { value: 0 },
      u_overall: { value: 0 },
      u_color1: { value: new THREE.Color(0x0a3d62) },
      u_color2: { value: new THREE.Color(0x38bdf8) },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // 3. Khởi động hệ thống Audio UI bindings
  initAudioSystem();

  // 4. Window Resize
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 5. Animation Loop
  const clock = new THREE.Clock();

  function tick() {
    const elapsedTime = clock.getElapsedTime();
    controls.update();

    // Lấy dữ liệu âm thanh phân tích thời gian thực
    const audio = getAudioData();

    // Cập nhật Shader Uniforms
    material.uniforms.u_time.value = elapsedTime;
    material.uniforms.u_bass.value = audio.bass;
    material.uniforms.u_mid.value = audio.mid;
    material.uniforms.u_treble.value = audio.treble;
    material.uniforms.u_overall.value = audio.overall;

    mesh.rotation.z = elapsedTime * 0.1 + audio.overall * 0.2;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

const canvas = document.querySelector("canvas.webgl");
if (!canvas) throw new Error("No canvas.webgl");
initLog32(canvas);
