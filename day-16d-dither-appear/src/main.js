// day 16d - dither reveal: the baked field appears / disappears
// Same bake-once idea as 16c, plus one reveal trick in the display
// pass: give every pixel its own random threshold, animate a global
// progress value, a pixel shows once progress passes its threshold

import * as THREE from "three";

const COLOR_LOW = new THREE.Color(0x0f1418);
const COLOR_HIGH = new THREE.Color(0x5a7d8c);
const SPEED = 1.6;
const EDGE = 0.08;
const ORDERED = false;

const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const simplex2D = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
    m=m*m; m=m*m;
    vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5;
    vec3 ox=floor(x+0.5); vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.0*dot(m,g);
  }
`;

// bake - identical to 16c, runs once
const bakeFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uLow, uHigh;
  ${simplex2D}
  float fbm(vec2 p){
    float total=0.0, amp=0.5;
    for(int i=0;i<5;i++){ total+=snoise(p)*amp; p*=2.0; amp*=0.5; }
    return total;
  }
  void main(){
    float v = fbm(vUv * 4.0) * 0.5 + 0.5;
    v = smoothstep(0.3, 0.7, v);
    gl_FragColor = vec4(mix(uLow, uHigh, v), 1.0);
  }
`;

// display - samples the baked field, then reveals it pixel by pixel
const displayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uField;
  uniform vec2 uRes;
  uniform float uProgress;
  uniform float uEdge;
  uniform float uOrdered;

  // 4x4 Bayer matrix -> structured/retro dither pattern
  float bayer(vec2 px){
    int x = int(mod(px.x, 4.0));
    int y = int(mod(px.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
    m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
    m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
    m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
    float v = 0.0;
    for(int k=0;k<16;k++){ if(k==i) v = m[k]; }
    return v / 16.0;
  }
  // random hash -> organic scattered dither
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

  void main(){
    vec3 field = texture2D(uField, vUv).rgb;

    vec2 px = floor(vUv * uRes);
    float threshold = uOrdered > 0.5 ? bayer(px) : hash(px);

    // pixel appears once uProgress crosses its own threshold
    float reveal = smoothstep(threshold - uEdge, threshold + uEdge, uProgress);

    gl_FragColor = vec4(field * reveal, 1.0);
  }
`;

const renderer = new THREE.WebGLRenderer({ antialias: true });
const dpr = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.Camera();
const quad = new THREE.PlaneGeometry(2, 2);

function makeRT() {
  return new THREE.WebGLRenderTarget(
    window.innerWidth * dpr,
    window.innerHeight * dpr,
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    },
  );
}
let fieldRT = makeRT();

const bakeScene = new THREE.Scene();
const bakeMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: bakeFragment,
  uniforms: { uLow: { value: COLOR_LOW }, uHigh: { value: COLOR_HIGH } },
});
bakeScene.add(new THREE.Mesh(quad, bakeMat));
function bakeField() {
  renderer.setRenderTarget(fieldRT);
  renderer.render(bakeScene, camera);
  renderer.setRenderTarget(null);
}
bakeField();

const displayScene = new THREE.Scene();
const displayMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: displayFragment,
  uniforms: {
    uField: { value: fieldRT.texture },
    uRes: {
      value: new THREE.Vector2(
        window.innerWidth * dpr,
        window.innerHeight * dpr,
      ),
    },
    uProgress: { value: 0 },
    uEdge: { value: EDGE },
    uOrdered: { value: ORDERED ? 1 : 0 },
  },
});
displayScene.add(new THREE.Mesh(quad, displayMat));

// click or space toggles reveal / hide
let progress = 0;
let targetP = 1;
function toggle() {
  targetP = targetP > 0.5 ? 0 : 1;
}
window.addEventListener("pointerdown", toggle);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") toggle();
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  displayMat.uniforms.uRes.value.set(
    window.innerWidth * dpr,
    window.innerHeight * dpr,
  );
  fieldRT.dispose();
  fieldRT = makeRT();
  bakeField();
  displayMat.uniforms.uField.value = fieldRT.texture;
});

// animate progress toward target, then display
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const dir = Math.sign(targetP - progress);
  progress += dir * SPEED * dt;
  progress = Math.max(0, Math.min(1, progress));
  displayMat.uniforms.uProgress.value = progress;

  renderer.setRenderTarget(null);
  renderer.render(displayScene, camera);
  requestAnimationFrame(frame);
}
// pass a real timestamp on the first call - requestAnimationFrame
// supplies this automatically on every call after, but this first
// one is manual, so `now` would otherwise be undefined -> NaN dt
frame(performance.now());
