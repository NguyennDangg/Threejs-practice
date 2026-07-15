// Day 16c - bake to texture: generate an expensive field ONCE,
// then sample it cheaply every frame after that.
// Compare to 16b: no loop on the bake, no ping-pong swap - the field
// never changes, so there's nothing to keep recomputing (runs once and never animate like the thing i learned earlier)

import * as THREE from "three";

const COLOR_LOW = new THREE.Color(0x0f1418);
const COLOR_HIGH = new THREE.Color(0x5a7d8c);

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

// bake shader - the expensive part, only ever runs once (or on resize)
const bakeFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uRes;
  uniform vec3 uLow, uHigh;
  uniform float uTime; // frozen at whatever value it had during the bake call
  ${simplex2D}

  float fbm(vec2 p){
    float total=0.0, amp=0.5;
    for(int i=0;i<5;i++){ total+=snoise(p)*amp; p*=2.0; amp*=0.5; }
    return total;
  }
  void main(){
    float v = fbm(vUv * 4.0 + uTime) * 0.5 + 0.5;
    v = smoothstep(0.3, 0.7, v);
    gl_FragColor = vec4(mix(uLow, uHigh, v), 1.0);
  }
`;

// display shader — every frame, just a texture lookup, no math at all
const displayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uField;
  void main(){
    gl_FragColor = texture2D(uField, vUv);
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
  uniforms: {
    uRes: {
      value: new THREE.Vector2(
        window.innerWidth * dpr,
        window.innerHeight * dpr,
      ),
    },
    uLow: { value: COLOR_LOW },
    uHigh: { value: COLOR_HIGH },
    uTime: { value: 0 },
  },
});
bakeScene.add(new THREE.Mesh(quad, bakeMat));

// this is the "once" - try calling it again later and nothing will change
// on screen unless you also update uTime.value first, since the field
// only reflects whatever uTime was AT THE MOMENT this function ran
function bakeField() {
  bakeMat.uniforms.uTime.value = performance.now() * 0.0002; // pick a fixed moment
  renderer.setRenderTarget(fieldRT);
  renderer.render(bakeScene, camera);
  renderer.setRenderTarget(null);
}
bakeField();

const displayScene = new THREE.Scene();
const displayMat = new THREE.ShaderMaterial({
  vertexShader: fullscreenVert,
  fragmentShader: displayFragment,
  uniforms: { uField: { value: fieldRT.texture } },
});
displayScene.add(new THREE.Mesh(quad, displayMat));

// resize changes resolution, so the field needs a fresh bake
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  bakeMat.uniforms.uRes.value.set(
    window.innerWidth * dpr,
    window.innerHeight * dpr,
  );
  fieldRT.dispose();
  fieldRT = makeRT();
  bakeField();
  displayMat.uniforms.uField.value = fieldRT.texture;
});

// the loop itself does no noise math - just displays the baked result
function frame() {
  renderer.setRenderTarget(null);
  renderer.render(displayScene, camera);
  requestAnimationFrame(frame);
}
frame();
