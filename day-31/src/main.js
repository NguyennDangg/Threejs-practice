import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  NormalPass,
  SSAOEffect,
  DepthOfFieldEffect,
  BloomEffect,
  VignetteEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from "postprocessing";

// Build 911 as Group with more accurate Porsche styling
function build911(detail, livery) {
  const seg = detail === 2 ? 4 : detail === 1 ? 8 : 16;
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: livery.body,
    roughness: 0.25,
    metalness: 0.75,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.6,
  });

  // Main body - lower, wider, more sloped
  const bodyGeo = new RoundedBoxGeometry(1.6, 0.35, 2.8, seg, 0.08);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.28, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Cabin - iconic sloped back
  const cabGeo = new RoundedBoxGeometry(1.3, 0.48, 1.4, seg, 0.1);
  const cab = new THREE.Mesh(cabGeo, bodyMat);
  cab.position.set(0, 0.65, -0.3);
  cab.scale.set(1, 1, 1.1); // stretch back for fastback look
  cab.castShadow = true;
  cab.receiveShadow = true;
  group.add(cab);

  // Windshield
  const windshieldGeo = new RoundedBoxGeometry(1.25, 0.42, 0.7, seg, 0.08);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, 0.68, 0.35);
  windshield.rotation.x = -0.15; // angled windshield
  windshield.castShadow = true;
  group.add(windshield);

  // Rear window - classic 911 slope
  const rearWindowGeo = new RoundedBoxGeometry(1.2, 0.35, 0.65, seg, 0.08);
  const rearWindow = new THREE.Mesh(rearWindowGeo, glassMat);
  rearWindow.position.set(0, 0.65, -0.85);
  rearWindow.rotation.x = 0.25; // steep rear slope
  rearWindow.castShadow = true;
  group.add(rearWindow);

  // Front hood - lower, flatter
  const hoodGeo = new RoundedBoxGeometry(1.55, 0.22, 0.95, seg, 0.06);
  const hood = new THREE.Mesh(hoodGeo, bodyMat);
  hood.position.set(0, 0.38, 1.2);
  hood.rotation.x = -0.08; // slight downward slope
  hood.castShadow = true;
  hood.receiveShadow = true;
  group.add(hood);

  // Rear deck/engine cover - iconic 911 rear
  const rearDeckGeo = new RoundedBoxGeometry(1.58, 0.28, 0.85, seg, 0.07);
  const rearDeck = new THREE.Mesh(rearDeckGeo, bodyMat);
  rearDeck.position.set(0, 0.42, -1.45);
  rearDeck.rotation.x = 0.05; // slight upward angle
  rearDeck.castShadow = true;
  rearDeck.receiveShadow = true;
  group.add(rearDeck);

  // Front bumper/spoiler
  const frontBumperGeo = new RoundedBoxGeometry(1.65, 0.12, 0.25, seg, 0.04);
  const frontBumper = new THREE.Mesh(frontBumperGeo, bodyMat);
  frontBumper.position.set(0, 0.15, 1.85);
  frontBumper.castShadow = true;
  group.add(frontBumper);

  // Rear spoiler - classic ducktail
  const spoilerGeo = new RoundedBoxGeometry(1.4, 0.08, 0.35, seg, 0.03);
  const spoiler = new THREE.Mesh(spoilerGeo, bodyMat);
  spoiler.position.set(0, 0.72, -1.75);
  spoiler.rotation.x = 0.15; // angled up
  spoiler.castShadow = true;
  group.add(spoiler);

  // Racing stripe (if specified)
  if (livery.stripe) {
    const stripeMat = new THREE.MeshStandardMaterial({
      color: livery.stripe,
      roughness: 0.3,
      metalness: 0.7,
    });

    // Center stripe on hood
    const stripeHoodGeo = new THREE.BoxGeometry(0.35, 0.01, 1.0);
    const stripeHood = new THREE.Mesh(stripeHoodGeo, stripeMat);
    stripeHood.position.set(0, 0.5, 1.2);
    group.add(stripeHood);

    // Center stripe on cabin
    const stripeCabGeo = new THREE.BoxGeometry(0.35, 0.01, 1.5);
    const stripeCab = new THREE.Mesh(stripeCabGeo, stripeMat);
    stripeCab.position.set(0, 0.92, -0.3);
    stripeCab.rotation.x = -0.1;
    group.add(stripeCab);

    // Center stripe on rear
    const stripeRearGeo = new THREE.BoxGeometry(0.35, 0.01, 0.9);
    const stripeRear = new THREE.Mesh(stripeRearGeo, stripeMat);
    stripeRear.position.set(0, 0.71, -1.45);
    group.add(stripeRear);
  }

  // Wheels - wider, more detailed
  const wheelSeg = detail === 2 ? 8 : detail === 1 ? 12 : 20;
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, wheelSeg);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.5,
    metalness: 0.5,
  });

  // Brake discs - red for racing look
  const brakeGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, wheelSeg);
  const brakeMat = new THREE.MeshStandardMaterial({
    color: livery.stripe || 0xc1121f,
    roughness: 0.7,
    metalness: 0.3,
    emissive: livery.stripe || 0xc1121f,
    emissiveIntensity: 0.2,
  });

  // Front wheels (slightly narrower)
  for (const [x, z] of [
    [0.78, 1.05],
    [-0.78, 1.05],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.18, z);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);

    const brake = new THREE.Mesh(brakeGeo, brakeMat);
    brake.rotation.z = Math.PI / 2;
    brake.position.set(x > 0 ? x - 0.08 : x + 0.08, 0.18, z);
    group.add(brake);
  }

  // Rear wheels (wider - classic 911 stance)
  const rearWheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, wheelSeg);
  for (const [x, z] of [
    [0.82, -1.2],
    [-0.82, -1.2],
  ]) {
    const wheel = new THREE.Mesh(rearWheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.18, z);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);

    const brake = new THREE.Mesh(brakeGeo, brakeMat);
    brake.rotation.z = Math.PI / 2;
    brake.position.set(x > 0 ? x - 0.1 : x + 0.1, 0.18, z);
    group.add(brake);
  }

  // Side mirrors
  const mirrorGeo = new THREE.BoxGeometry(0.1, 0.08, 0.12);
  for (const x of [-0.72, 0.72]) {
    const mirror = new THREE.Mesh(mirrorGeo, bodyMat);
    mirror.position.set(x, 0.72, 0.5);
    mirror.castShadow = true;
    group.add(mirror);
  }

  return group;
}

const LIVERIES = [
  { body: 0xe8e8e8, stripe: 0xc1121f, name: "MARTINI" },
  { body: 0x2a5a8a, stripe: 0xff8c42, name: "GULF" },
  { body: 0x1a1a24, stripe: 0xffd700, name: "JPS" },
];

function initLog31(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080c);
  scene.fog = new THREE.Fog(0x08080c, 18, 55);

  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(6, 5, 10);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0, 0);
  controls.minDistance = 4;
  controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI * 0.48;

  const world = new THREE.Group();
  scene.add(world);

  // Asphalt
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshStandardMaterial({
      color: 0x0e0e14,
      roughness: 0.95,
      metalness: 0.02,
    }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  world.add(asphalt);

  // Curbs
  for (const z of [-9.5, 9.5]) {
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.15, 0.6),
      new THREE.MeshStandardMaterial({
        color: z < 0 ? 0xc1121f : 0xe8e8e8,
        roughness: 0.8,
      }),
    );
    curb.position.set(0, 0.075, z);
    curb.receiveShadow = true;
    world.add(curb);
  }

  // 2 cars with better positioning
  const cars = [];
  const COUNT = 2;

  for (let i = 0; i < COUNT; i++) {
    const livery = LIVERIES[i % LIVERIES.length];
    const carGroup = build911(0, livery);

    // Headlights - iconic round 911 lights
    for (const x of [-0.55, 0.55]) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 12),
        new THREE.MeshStandardMaterial({
          color: 0xfffff0,
          emissive: 0xffd9a8,
          emissiveIntensity: 1.5,
          roughness: 0.2,
          metalness: 0.8,
        }),
      );
      light.position.set(x, 0.32, 1.75);
      carGroup.add(light);
    }

    // Tail lights - rectangular 911 style
    for (const x of [-0.62, 0.62]) {
      const tailLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.18, 0.08),
        new THREE.MeshStandardMaterial({
          color: 0xff0000,
          emissive: 0xaa0000,
          emissiveIntensity: 0.8,
          roughness: 0.3,
        }),
      );
      tailLight.position.set(x, 0.38, -1.85);
      carGroup.add(tailLight);
    }

    // Position cars with nice spacing and slight angle
    const x = (i - 0.5) * 5.5;
    const z = i === 0 ? 1.2 : -1.8;
    carGroup.position.set(x, 0, z);
    carGroup.rotation.y = i === 0 ? Math.PI / 2 + 0.08 : Math.PI / 2 - 0.08;

    world.add(carGroup);
    cars.push({ group: carGroup, tier: 0, i });
  }

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(12, 16, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.far = 50;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc1121f, 2.4);
  rim.position.set(-10, 4, -8);
  scene.add(rim);

  // Post-processing
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
  });
  composer.addPass(new RenderPass(scene, camera));

  const normalPass = new NormalPass(scene, camera);
  composer.addPass(normalPass);

  const ssao = new SSAOEffect(camera, normalPass.texture, {
    blendFunction: 0,
    samples: 16,
    rings: 4,
    distanceThreshold: 1.0,
    distanceFalloff: 0.0,
    rangeThreshold: 0.0005,
    rangeFalloff: 0.1,
    luminanceInfluence: 0.6,
    radius: 0.06,
    scale: 1.0,
    bias: 0.025,
    intensity: 1.0,
    color: new THREE.Color(0x000000),
  });
  ssao.blendMode.opacity.value = 0.6;
  const ssaoPass = new EffectPass(camera, ssao);
  composer.addPass(ssaoPass);

  const dof = new DepthOfFieldEffect(camera, {
    focusDistance: 0.02,
    focalLength: 0.05,
    bokehScale: 2.0,
  });
  const dofPass = new EffectPass(camera, dof);
  composer.addPass(dofPass);

  const bloom = new BloomEffect({
    intensity: 0.8,
    luminanceThreshold: 0.85,
    luminanceSmoothing: 0.3,
    mipmapBlur: true,
  });
  const bloomPass = new EffectPass(camera, bloom);
  composer.addPass(bloomPass);

  composer.addPass(
    new EffectPass(
      camera,
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      new VignetteEffect({ offset: 0.38, darkness: 0.7 }),
    ),
  );

  // UI
  const state = {
    ssao: 0.6,
    focus: 0.02,
    aperture: 0.05,
    stack: "ssao",
  };

  const ssaoEl = document.querySelector("[data-ssao]");
  const focusEl = document.querySelector("[data-focus]");
  const apertureEl = document.querySelector("[data-aperture]");
  const ssaoValEl = document.querySelector("[data-ssao-v]");
  const focusValEl = document.querySelector("[data-focus-v]");
  const apertureValEl = document.querySelector("[data-aperture-v]");

  if (ssaoEl) {
    ssaoEl.value = String(state.ssao);
    ssaoValEl.textContent = state.ssao.toFixed(2);

    ssaoEl.oninput = () => {
      state.ssao = Number(ssaoEl.value);
      ssao.blendMode.opacity.value = state.ssao;
      ssaoValEl.textContent = state.ssao.toFixed(2);
    };
  }

  if (focusEl) {
    focusEl.value = String(state.focus);
    focusValEl.textContent = (state.focus * 100).toFixed(0) + "cm";

    focusEl.oninput = () => {
      state.focus = Number(focusEl.value);
      dof.circleOfConfusionMaterial.uniforms.focusDistance.value = state.focus;
      focusValEl.textContent = (state.focus * 100).toFixed(0) + "cm";
    };
  }

  if (apertureEl) {
    apertureEl.value = String(state.aperture);
    apertureValEl.textContent = state.aperture.toFixed(5);

    apertureEl.oninput = () => {
      state.aperture = Number(apertureEl.value);
      dof.circleOfConfusionMaterial.uniforms.focalLength.value = state.aperture;
      dof.bokehScale = state.aperture * 4000;
      apertureValEl.textContent = state.aperture.toFixed(5);
    };
  }

  function setStack(mode) {
    state.stack = mode;
    ssao.blendMode.opacity.value = mode === "none" ? 0 : state.ssao;
    dof.bokehScale = mode === "full" ? state.aperture * 4000 : 0;
    bloom.intensity = mode === "full" ? 0.8 : 0;
    ssaoPass.enabled = mode !== "none";
    dofPass.enabled = mode !== "none";
    bloomPass.enabled = mode === "full";
  }

  document.querySelectorAll("[data-stack]").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll("[data-stack]")
        .forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      setStack(btn.dataset.stack);
    };
  });

  // Click to focus
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  canvas.addEventListener("pointerdown", (e) => {
    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    const allMeshes = [];
    cars.forEach((car) => {
      car.group.traverse((child) => {
        if (child.isMesh) allMeshes.push(child);
      });
    });

    const hits = raycaster.intersectObjects(allMeshes, false);
    if (hits.length > 0 && focusEl) {
      const hit = hits[0];
      const dist = hit.distance;
      const near = camera.near;
      const far = camera.far;
      const ndc = (dist - near) / (far - near);
      const focus = Math.min(0.99, Math.max(0.01, ndc));

      state.focus = focus;
      focusEl.value = String(focus);
      dof.circleOfConfusionMaterial.uniforms.focusDistance.value = focus;
      focusValEl.textContent = (focus * 100).toFixed(0) + "cm";
    }
  });

  // LOD
  const LOD_NEAR = 8;
  const LOD_FAR = 16;

  function updateLOD() {
    const camPos = camera.position;
    for (const car of cars) {
      const dist = car.group.position.distanceTo(camPos);
      const newTier = dist < LOD_NEAR ? 0 : dist < LOD_FAR ? 1 : 2;

      if (newTier !== car.tier) {
        car.tier = newTier;
      }
    }
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  const startTime = performance.now();

  function tick() {
    const t = (performance.now() - startTime) / 1000;
    controls.update();
    updateLOD();

    camera.position.y += Math.sin(t * 0.4) * 0.002;

    composer.render();
    requestAnimationFrame(tick);
  }

  tick();
}

const canvas = document.querySelector("canvas.webgl");
if (!canvas) throw new Error("No canvas.webgl");
initLog31(canvas);
