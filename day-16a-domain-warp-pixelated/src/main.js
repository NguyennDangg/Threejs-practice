import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const simplex2D = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}

  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                             + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

const combinedFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uRes;
  uniform vec3 uColorBg;
  uniform vec3 uColorLine;
  uniform float uCellSize;
  ${simplex2D}

  float fbm(vec2 p){
    float total = 0.0;
    float amp = 0.5;
    for(int i = 0; i < 5; i++){
      total += snoise(p) * amp;
      p *= 2.0;
      amp *= 0.5;
    }
    return total;
  }

  void main(){
    // step 1: snap to a pixel grid first (technique C, from Day 16)
    vec2 pixelCoord = vUv * uRes;
    vec2 snapped = floor(pixelCoord / uCellSize) * uCellSize;
    vec2 uv = snapped / uRes;

    uv = (uv - 0.5);
    uv.x *= uRes.x / uRes.y;

    float t = uTime * 0.08;

    // step 2: pointer-driven flow field (technique A_FLUID)
    float pd = distance(uv, uPointer);
    vec2 push = (uv - uPointer) * exp(-pd * 3.0) * 0.6;

    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(uv + q + push), fbm(uv + q + vec2(8.3, 2.8)));

    float v = fbm(uv + r);
    v = v * 0.5 + 0.5; // 0..1, this is the flow field's final value

    // step 3: slice the flow field into contour bands (technique B_WARP)
    // instead of a simple two-color mix, treat "v" the same way
    // B_WARP treated its domain-warped noise - as band data
    float bands = v * 10.0;
    float f = fract(bands);
    float edge = min(f, 1.0 - f);
    float line = smoothstep(0.08, 0.0, edge);

    vec3 col = mix(uColorBg, uColorLine, line);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const scene = new THREE.Scene();
const camera = new THREE.Camera();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const dpr = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
document.body.appendChild(renderer.domElement);

const uniforms = {
  uTime: { value: 0 },
  uPointer: { value: new THREE.Vector2(0, 0) },
  uRes: {
    value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr),
  },
  uColorBg: { value: new THREE.Color(0x5a7d8c) },
  uColorLine: { value: new THREE.Color(0x12161c) },
  uCellSize: { value: 8.0 },
};

const geo = new THREE.PlaneGeometry(2, 2);
const mat = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader: combinedFragment,
  uniforms,
});
const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);

// smoothed pointer, exponential decay
const target = new THREE.Vector2(0, 0);
const smooth = new THREE.Vector2(0, 0);
const OMEGA = 5;

window.addEventListener("pointermove", (e) => {
  target.x = (e.clientX / window.innerWidth) * 2 - 1;
  target.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.uRes.value.set(window.innerWidth * dpr, window.innerHeight * dpr);
});

let last = performance.now();
function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const a = Math.exp(-OMEGA * dt);
  smooth.x = target.x + (smooth.x - target.x) * a;
  smooth.y = target.y + (smooth.y - target.y) * a;

  uniforms.uTime.value = now * 0.001;
  uniforms.uPointer.value.copy(smooth);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
