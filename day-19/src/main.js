// day-19 - vertex shaders: deform the GEOMETRY itself, not the pixels

// The other half of GLSL. Everything before this was fragment-stage
// (per-pixel color). This is vertex-stage (per-point position), I
// take a sphere and push every vertex along its normal by an amount
// driven by noise + time + pointer - the MESH physically deforms

// New concepts vs everything prior:
// PerspectiveCamera (real 3D depth, not a flat plane)
// geometry with many vertices (sphere, not a 2-triangle quad)
// a vertex shader that MOVES position before rendering
// OrbitControls so you can rotate around it in 3D space

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// SHADERS

// simplex noise usable in BOTH stages (this is the 3D version)
const noiseGLSL = `
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

// VERTEX SHADER - this is the new part, it MOVES each vertex
const vertexShader = `
  ${noiseGLSL}
  uniform float uTime;
  uniform float uPointer;   // 0..1, how much the cursor is boosting displacement
  varying float vDisplace;  // pass the displacement amount to the fragment stage

  void main() {
    // 'position' and 'normal' arrive automatically for each vertex.
    // Three.js gives us these — position is where the point is, normal
    // is the direction pointing straight out from the surface there.

    // sample noise in 3D at this vertex's position, scrolling over time
    float n = snoise(position * 1.5 + uTime * 0.3);

    // how far to push this vertex OUT along its normal.
    // pointer boosts the amount so the cursor "inflates" the sphere.
    float displace = n * (0.15 + uPointer * 0.35);

    // move the vertex along its normal by that amount — THE deform
    vec3 newPosition = position + normal * displace;

    vDisplace = displace; // hand it to the fragment shader for coloring

    // the standard transform, but with our MOVED position
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

// FRAGMENT SHADER - color by how much each spot was displaced
const fragmentShader = `
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  varying float vDisplace;
  void main() {
    // remap displacement (~-0.5..0.5) to 0..1 and color between two tones
    float t = smoothstep(-0.3, 0.3, vDisplace);
    vec3 col = mix(uColorLow, uColorHigh, t);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// SCENE (real 3D now)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

// PERSPECTIVE camera - real depth, unlike the flat ortho quad
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 0, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// drag to orbit around it in 3D - feel the depth
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// a sphere with LOTS of vertices - the more segments, the smoother the
// deform (a flat plane couldn't do this; it has almost no vertices)
const geometry = new THREE.IcosahedronGeometry(1, 64); // 64 = high detail
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0 },
    uPointer: { value: 0 },
    uColorLow: { value: new THREE.Color(0x14202a) },
    uColorHigh: { value: new THREE.Color(0xc1121f) }, // NERV red on the peaks
  },
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// pointer: smoothly boost displacement while the mouse moves
// react to the movement of the mouse
let pointerTarget = 0;
let pointerSmooth = 0;
window.addEventListener("pointermove", () => {
  pointerTarget = 1;
  clearTimeout(window._pt);
  window._pt = setTimeout(() => (pointerTarget = 0), 150); // decay when still
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// loop
const startTime = performance.now();
let lastTime = startTime;

function frame() {
  const now = performance.now();
  const t = (now - startTime) / 1000; // elapsed seconds
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // ease pointer boost toward its target (frame-rate independent)
  pointerSmooth += (pointerTarget - pointerSmooth) * (1 - Math.exp(-6 * dt));

  material.uniforms.uTime.value = t;
  material.uniforms.uPointer.value = pointerSmooth;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
