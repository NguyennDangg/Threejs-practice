// Contact shadows — the soft dark pool where an object meets the ground.
// Shadow maps are bad at this; the depth texel covering the contact point
// is nearly coplanar with the floor, so it either acnes or floats.

// Instead: render the subject from below into a render target, storing
// distance-from-floor as brightness, blur it, and project it onto a
// plane. Render-to-texture + blur + sample as a mask — 16b and 16c
// pointed at a new problem.

import * as THREE from "three";

const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

// Distance from the floor camera, normalised. Near = dark = strong shadow.
// Clear colour is white, so anywhere the subject isn't stays "far".
const depthVert = `
  varying float vDepth;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z;
  }
`;

const depthFrag = `
  varying float vDepth;
  uniform float uFar;
  void main(){
    gl_FragColor = vec4(vec3(clamp(vDepth / uFar, 0.0, 1.0)), 1.0);
  }
`;

const blurFrag = `
  varying vec2 vUv;
  uniform sampler2D uSrc;
  uniform vec2 uStep;
  void main(){
    // 9-tap separable gaussian. Run once horizontally, once vertically.
    float w[5];
    w[0] = 0.227027; w[1] = 0.194594; w[2] = 0.121621;
    w[3] = 0.054054; w[4] = 0.016216;
    vec3 sum = texture2D(uSrc, vUv).rgb * w[0];
    for (int i = 1; i < 5; i++) {
      vec2 o = uStep * float(i);
      sum += texture2D(uSrc, vUv + o).rgb * w[i];
      sum += texture2D(uSrc, vUv - o).rgb * w[i];
    }
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// Reads the blurred depth and turns it into alpha. Black, transparent
// where the subject was far from the floor.
const planeFrag = `
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform float uDarkness;
  void main(){
    float d = texture2D(uMap, vUv).r;
    float a = (1.0 - d) * uDarkness;
    // Fade the edges so the plane's own border never shows.
    vec2 e = smoothstep(0.0, 0.12, vUv) * smoothstep(0.0, 0.12, 1.0 - vUv);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * e.x * e.y);
  }
`;

const planeVert = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class ContactShadow {
  constructor(
    renderer,
    { size = 9, height = 2.2, resolution = 512, darkness = 1.5 } = {},
  ) {
    this.renderer = renderer;
    this.height = height;

    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(resolution, resolution, opts);
    this.rtB = new THREE.WebGLRenderTarget(resolution, resolution, opts);

    // Orthographic, sitting on the floor, looking straight up.
    // rotation.x = PI/2 turns the default -Z view direction into +Y.
    this.camera = new THREE.OrthographicCamera(
      -size / 2,
      size / 2,
      size / 2,
      -size / 2,
      0,
      height,
    );
    this.camera.rotation.x = Math.PI / 2;
    this.camera.position.y = 0;

    this.depthMat = new THREE.ShaderMaterial({
      vertexShader: depthVert,
      fragmentShader: depthFrag,
      uniforms: { uFar: { value: height } },
      side: THREE.DoubleSide,
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: blurFrag,
      uniforms: {
        uSrc: { value: null },
        uStep: { value: new THREE.Vector2() },
      },
    });

    this.blurScene = new THREE.Scene();
    this.blurCamera = new THREE.Camera();
    this.blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat);
    this.blurScene.add(this.blurQuad);

    this.material = new THREE.ShaderMaterial({
      vertexShader: planeVert,
      fragmentShader: planeFrag,
      uniforms: {
        uMap: { value: this.rtA.texture },
        uDarkness: { value: darkness },
      },
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      this.material,
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.002; // just above the floor, avoids z-fighting
    this.mesh.renderOrder = 2;

    this.resolution = resolution;
    this.blurAmount = 2.2;
  }

  // subject: the object to cast. hide: things to exclude (the floor).
  update(scene, subject, hide = []) {
    const renderer = this.renderer;
    const prevBg = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevVisible = hide.map((o) => o.visible);

    hide.forEach((o) => (o.visible = false));
    this.mesh.visible = false;
    scene.background = null;
    scene.overrideMaterial = this.depthMat;

    renderer.setRenderTarget(this.rtA);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(scene, this.camera);

    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    hide.forEach((o, i) => (o.visible = prevVisible[i]));
    this.mesh.visible = true;

    // Separable blur: A -> B horizontally, B -> A vertically.
    const px = this.blurAmount / this.resolution;
    this.blurQuad.material = this.blurMat;

    this.blurMat.uniforms.uSrc.value = this.rtA.texture;
    this.blurMat.uniforms.uStep.value.set(px, 0);
    renderer.setRenderTarget(this.rtB);
    renderer.render(this.blurScene, this.blurCamera);

    this.blurMat.uniforms.uSrc.value = this.rtB.texture;
    this.blurMat.uniforms.uStep.value.set(0, px);
    renderer.setRenderTarget(this.rtA);
    renderer.render(this.blurScene, this.blurCamera);

    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.depthMat.dispose();
    this.blurMat.dispose();
  }
}
