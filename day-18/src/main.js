// day-18a — scatter transition OVERLAY (button-triggered, no routing yet)
// a transition is a full-screen panel that sits ON TOP of the page
// it scatters IN to hide everything (cover), the page swaps underneath
// while hidden, then it scatters OUT to reveal the new page (reveal)

// This is my Day 17 dither reveal, repackaged: instead of revealing
// a type image, it reveals a solid wall of pixels, same threshold math,
// exposed as .cover() and .reveal() you can call on demand, i will
// wire these to real navigation in the future; 18a just proves the effect with a button
import * as THREE from "three";

const OVERLAY_COLOR = new THREE.Color(0x0a0a0a); // the wall color (NERV black)
const DURATION = 0.9;   // seconds for a cover or reveal sweep
const EDGE = 0.12;      // dither wave softness
const CELL = 6;         // pixel-block size of the scatter

const fullscreenVert = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

// The overlay shader: fills the screen with OVERLAY_COLOR, gated by the
// same per-pixel dither threshold from Day 17. uProgress 0 = fully clear
// (page visible), 1 = fully covered (wall of pixels)
const overlayFragment = `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uRes;
  uniform float uProgress;   // 0 = clear, 1 = covered
  uniform float uEdge, uCell;
  uniform vec3 uColor;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

  void main(){
    vec2 px = floor(vUv * uRes / uCell);
    float threshold = hash(px);
    // a pixel is covered once progress passes its threshold
    float p = uProgress * (1.0 + 2.0 * uEdge) - uEdge;
    float covered = smoothstep(threshold - uEdge, threshold + uEdge, p);
    // output color where covered; alpha carries the coverage so the
    // page shows through where not yet covered
    gl_FragColor = vec4(uColor, covered);
  }
`;

// the reusable overlay object
function createTransitionOverlay() {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // sit the canvas ON TOP of everything, ignore clicks when idle
  Object.assign(renderer.domElement.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    pointerEvents: "none",
  });
  document.body.appendChild(renderer.domElement);

  const uniforms = {
    uRes: { value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) },
    uProgress: { value: 0 },
    uEdge: { value: EDGE },
    uCell: { value: CELL },
    uColor: { value: OVERLAY_COLOR },
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: overlayFragment,
      uniforms,
      transparent: true,   // so the page shows through the clear parts
    })
  );
  scene.add(mesh);

  let progress = 0;
  let targetProgress = 0;
  let onArrive = null;   // callback fired when a sweep completes

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uRes.value.set(window.innerWidth * dpr, window.innerHeight * dpr);
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // move progress toward target at 1/DURATION per second
    if (progress !== targetProgress) {
      const dir = Math.sign(targetProgress - progress);
      progress += dir * (dt / DURATION);
      if ((dir > 0 && progress >= targetProgress) ||
          (dir < 0 && progress <= targetProgress)) {
        progress = targetProgress;
        if (onArrive) { const cb = onArrive; onArrive = null; cb(); }
      }
      uniforms.uProgress.value = progress;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // public API
  return {
    // scatter IN to hide the page; calls done() when fully covered
    cover(done) { targetProgress = 1; onArrive = done || null; },
    // scatter OUT to reveal the page
    reveal(done) { targetProgress = 0; onArrive = done || null; },
    // full cover→(swap)→reveal in one call
    transition(swapPageFn) {
      this.cover(() => {
        if (swapPageFn) swapPageFn();   // page swap happens while hidden
        this.reveal();
      });
    },
  };
}

// DEMO (18a: button-triggered)
const overlay = createTransitionOverlay();

// a fake "page" to see the transition do something
const pages = ["PAGE_01 // HOME", "PAGE_02 // WORK", "PAGE_03 // ABOUT"];
let pageIndex = 0;

const label = document.getElementById("page-label");
const btn = document.getElementById("go-btn");
label.textContent = pages[pageIndex];

btn.addEventListener("click", () => {
  overlay.transition(() => {
    // this runs while the screen is fully covered - swap "page" content
    pageIndex = (pageIndex + 1) % pages.length;
    label.textContent = pages[pageIndex];
  });
});