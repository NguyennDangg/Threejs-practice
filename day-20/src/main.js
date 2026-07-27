// day 20 - camera choreography: making a camera move feel OPERATED, not interpolated
// Craft rules applied:
// 1. ARC      - swing wider mid-move (additive sin bump, no joints)
// 2. SCALE    - duration follows how far it actually travels
// 3. DESYNC   - each axis reads one progress through its OWN curve
// 4. PARALLAX - the look-at target drifts too
// 5. HANDOFF  - tween owns the camera while animating, controls own
//                 it otherwise, never both on the same frame
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import gsap from "gsap";

const VIEWS = {
  FRONT: { radius: 6, phi: 78, theta: 0, target: [0, 0.5, 0] },
  SIDE: { radius: 6, phi: 78, theta: 90, target: [0, 0.5, 0] },
  REAR: { radius: 6, phi: 78, theta: 180, target: [0, 0.5, 0] },
  TOP: { radius: 7, phi: 8, theta: 0, target: [0, 0.3, 0] },
  DETAIL: { radius: 2.6, phi: 70, theta: 42, target: [0.6, 0.5, 0.9] },
};

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

const BASE_FOV = 50;
const FOV_BUMP = 3.5; // how much the frame widens mid-move

const camera = new THREE.PerspectiveCamera(
  BASE_FOV,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 2, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

scene.add(new THREE.AmbientLight(0x334455, 5));
const dirLight = new THREE.DirectionalLight(0xffddaa, 6);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.3,
    metalness: 0.5,
  }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

new GLTFLoader().load("/assets/RB20.glb", (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += size.y / 2;
  scene.add(model);
});

// CHOREOGRAPHY

// per-axis easing curves, each axis reads the SAME progress value
// through a DIFFERENT curve - that's the desync, and because every
// curve is continuous there are no keyframe joints to stall on
const easeTheta = gsap.parseEase("power2.inOut");
const easePhi = gsap.parseEase("power3.inOut");
const easeRadius = gsap.parseEase("power2.inOut");
const easeTarget = gsap.parseEase("power2.inOut");

const progress = { p: 0 };
let animating = false;

function goToView(view) {
  // read wherever the camera CURRENTLY is - works from any position,
  // any angle, even mid-drag or mid-flight
  const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
  const start = new THREE.Spherical().setFromVector3(offset);
  const startTarget = controls.target.clone();

  const endPhi = THREE.MathUtils.degToRad(view.phi);
  let deltaTheta = THREE.MathUtils.degToRad(view.theta) - start.theta;
  deltaTheta = Math.atan2(Math.sin(deltaTheta), Math.cos(deltaTheta)); // shortest way round
  const endTheta = start.theta + deltaTheta;
  const endTarget = new THREE.Vector3(...view.target);

  // RULE 2 - duration scales with distance travelled, so every move
  // reads as the same physical speed
  const span =
    Math.abs(deltaTheta) +
    Math.abs(endPhi - start.phi) +
    Math.abs(view.radius - start.radius) * 0.25;
  const dur = THREE.MathUtils.clamp(0.65 + span * 0.42, 0.7, 2.1);

  // RULE 1 - how far the camera swings wide at the midpoint
  const arc = Math.max(start.radius, view.radius) * 0.3;

  gsap.killTweensOf(progress);
  progress.p = 0;
  animating = true;
  controls.autoRotate = false;

  gsap.to(progress, {
    p: 1,
    duration: dur,
    ease: "none", // linear master, real easing is per-axis
    onUpdate: () => {
      const p = progress.p;

      const theta = THREE.MathUtils.lerp(start.theta, endTheta, easeTheta(p));
      const phi = THREE.MathUtils.lerp(start.phi, endPhi, easePhi(p));
      let radius = THREE.MathUtils.lerp(
        start.radius,
        view.radius,
        easeRadius(p),
      );

      // ARC - additive bump. sin() is 0 at both ends, 1 in the middle,
      // so it adds distance mid-move and vanishes at each end, smooth
      radius += arc * Math.sin(p * Math.PI);

      // RULE 4 - drift the look-at point for parallax
      controls.target.lerpVectors(startTarget, endTarget, easeTarget(p));

      const sph = new THREE.Spherical(radius, phi, theta);
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(controls.target);

      // FOV widens mid-move, back to base at rest - same sin bump
      // the eye reads a widening frame as acceleration.
      camera.fov = BASE_FOV + FOV_BUMP * Math.sin(p * Math.PI);
      camera.updateProjectionMatrix();
    },
    onComplete: () => {
      animating = false;
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
      controls.update(); // clean handoff, once
    },
  });
}

document.querySelectorAll(".panel button").forEach((btn) => {
  btn.addEventListener("click", () => goToView(VIEWS[btn.dataset.view]));
});

// RULE 5 - a drag can INTERRUPT the flight, controls take over from
// exactly where the camera is, with no jump
renderer.domElement.addEventListener("pointerdown", () => {
  if (animating) {
    gsap.killTweensOf(progress);
    animating = false;
    camera.fov = BASE_FOV;
    camera.updateProjectionMatrix();
    controls.update();
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// loop
function frame() {
  requestAnimationFrame(frame);
  // ONLY let controls drive when the tween isn't, two systems writing
  // camera.position on the same frame is what caused the jitter
  if (!animating) controls.update();
  renderer.render(scene, camera);
}
frame();
