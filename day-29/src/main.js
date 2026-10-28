import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PhysicsWorld } from "./physics-world.js";

async function initLog29(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0e);
  scene.fog = new THREE.Fog(0x0a0a0e, 18, 50);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(8, 6, 12);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 2, 0);
  controls.maxPolarAngle = Math.PI / 2.1;

  // ---- lights -------------------------------------------------------
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(8, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc1121f, 1.6);
  rim.position.set(-6, 4, -8);
  scene.add(rim);

  // ---- ground -------------------------------------------------------
  const FLOOR_SIZE = 20;
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR_SIZE, 0.5, FLOOR_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.8 }),
  );
  ground.position.y = -0.25; // top surface sits at y = 0
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- physics ------------------------------------------------------
  const physics = new PhysicsWorld();
  await physics.ready();

  physics.addBox(ground, { mass: 0 });

  // Every mesh driven by a rigid body — tower boxes AND launched balls.
  const bodies = [];

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a24,
    roughness: 0.6,
    metalness: 0.2,
  });

  function buildTower() {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set((j - 1) * 1.1, i * 1.05 + 0.52, 0);
        box.castShadow = true;
        box.receiveShadow = true;
        scene.add(box);
        physics.addBox(box, { mass: 1, restitution: 0.3, friction: 0.7 });
        bodies.push(box);
      }
    }
  }
  buildTower();

  // ---- waiting projectile -------------------------------------------
  const BALL_R = 0.5;
  const REST_POS = new THREE.Vector3(-6, 2, 8);

  const ballGeo = new THREE.SphereGeometry(BALL_R, 32, 32);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xc1121f,
    roughness: 0.3,
    metalness: 0.5,
    emissive: 0xc1121f,
    emissiveIntensity: 0.3,
  });

  let projectile = null; // non-null ONLY while waiting to be dragged

  function createProjectile() {
    if (projectile) return;
    projectile = new THREE.Mesh(ballGeo, ballMat);
    projectile.position.copy(REST_POS);
    projectile.castShadow = true;
    projectile.receiveShadow = true;
    scene.add(projectile);
  }
  createProjectile();

  // ---- culling: remove only what leaves the play area -----------------
  const BOUND_XZ = FLOOR_SIZE / 2 + 1; // a bit past the floor edge
  const BOUND_Y = -6;

  function cullFallen() {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const m = bodies[i];
      const p = m.position;
      if (
        p.y < BOUND_Y ||
        Math.abs(p.x) > BOUND_XZ ||
        Math.abs(p.z) > BOUND_XZ
      ) {
        physics.remove(m);
        scene.remove(m);
        bodies.splice(i, 1);
      }
    }
  }

  // ---- aim overlay ---------------------------------------------------
  const aimCanvas = document.querySelector(".aim-canvas");
  aimCanvas.width = window.innerWidth * window.devicePixelRatio;
  aimCanvas.height = window.innerHeight * window.devicePixelRatio;
  aimCanvas.style.width = `${window.innerWidth}px`;
  aimCanvas.style.height = `${window.innerHeight}px`;
  const aimCtx = aimCanvas.getContext("2d");
  aimCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const preview = document.querySelector(".preview");
  const hint = document.querySelector(".hint");

  // ---- dragging ------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();

  let isDragging = false;
  let dragStartScreen = new THREE.Vector2();

  canvas.addEventListener("pointerdown", (e) => {
    if (!projectile) return;

    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.intersectObject(projectile, false).length === 0) return;

    isDragging = true;
    controls.enabled = false;

    // Plane through the ball, facing the camera — so dragging stays in
    // the ball's own depth slice and never feels like it teleports.
    dragPlane.setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()).negate(),
      projectile.position,
    );

    dragStartScreen.set(e.clientX, e.clientY);
    if (hint) hint.classList.add("active");
    if (preview) preview.classList.add("active");
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!isDragging || !projectile) return;

    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);

    if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
      projectile.position.copy(hitPoint);
    }

    if (preview) {
      preview.style.left = `${e.clientX - 20}px`;
      preview.style.top = `${e.clientY - 20}px`;
    }
  });

  canvas.addEventListener("pointerup", () => {
    if (!isDragging || !projectile) return;
    isDragging = false;
    controls.enabled = true;

    if (hint) hint.classList.remove("active");
    if (preview) preview.classList.remove("active");

    const pull = new THREE.Vector3().subVectors(projectile.position, REST_POS);
    const strength = Math.min(pull.length() * 3.5, 25);

    if (strength < 0.5) {
      projectile.position.copy(REST_POS); // cancelled — snap back
      return;
    }

    const launchVel = pull.normalize().multiplyScalar(strength);

    physics.addSphere(projectile, { mass: 2, restitution: 0.6, friction: 0.4 });
    physics.setLinearVelocity(projectile, launchVel);
    bodies.push(projectile);

    // Hand off: it now belongs to the physics world, not the cursor.
    // Without this, createProjectile() would delete the ball mid-flight.
    projectile = null;

    setTimeout(createProjectile, 700);
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---- buttons -------------------------------------------------------
  document
    .querySelector("[data-action='spawn']")
    ?.addEventListener("click", () => {
      createProjectile();
    });

  document
    .querySelector("[data-action='reset']")
    ?.addEventListener("click", () => {
      for (const m of bodies) {
        physics.remove(m);
        scene.remove(m);
      }
      bodies.length = 0;

      if (projectile) {
        scene.remove(projectile);
        projectile = null;
      }

      buildTower();
      createProjectile();
    });

  document
    .querySelector("[data-action='chaos']")
    ?.addEventListener("click", () => {
      for (const m of bodies) {
        const imp = new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          Math.random() * 5 + 2,
          (Math.random() - 0.5) * 8,
        );
        physics.applyImpulse(m, imp);
      }
    });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    aimCanvas.width = window.innerWidth * window.devicePixelRatio;
    aimCanvas.height = window.innerHeight * window.devicePixelRatio;
    aimCanvas.style.width = `${window.innerWidth}px`;
    aimCanvas.style.height = `${window.innerHeight}px`;
    aimCtx.setTransform(1, 0, 0, 1, 0, 0);
    aimCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  });

  // ---- loop ----------------------------------------------------------
  let last = performance.now();

  function tick() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    controls.update();
    physics.step(dt);
    cullFallen();

    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);

    if (isDragging && projectile) {
      const restS = REST_POS.clone().project(camera);
      const curS = projectile.position.clone().project(camera);

      const restX = (restS.x * 0.5 + 0.5) * window.innerWidth;
      const restY = (-restS.y * 0.5 + 0.5) * window.innerHeight;
      const curX = (curS.x * 0.5 + 0.5) * window.innerWidth;
      const curY = (-curS.y * 0.5 + 0.5) * window.innerHeight;

      // Pull line
      aimCtx.strokeStyle = "#c1121f";
      aimCtx.lineWidth = 3;
      aimCtx.setLineDash([]);
      aimCtx.beginPath();
      aimCtx.moveTo(restX, restY);
      aimCtx.lineTo(curX, curY);
      aimCtx.stroke();

      // Arrowhead at the cursor, pointing along the pull (= launch dir)
      const angle = Math.atan2(curY - restY, curX - restX);
      const A = 16;
      aimCtx.fillStyle = "#c1121f";
      aimCtx.beginPath();
      aimCtx.moveTo(curX, curY);
      aimCtx.lineTo(
        curX - Math.cos(angle - 0.3) * A,
        curY - Math.sin(angle - 0.3) * A,
      );
      aimCtx.lineTo(
        curX - Math.cos(angle + 0.3) * A,
        curY - Math.sin(angle + 0.3) * A,
      );
      aimCtx.closePath();
      aimCtx.fill();

      // ---- full trajectory preview ----------------------------------
      const pull = new THREE.Vector3().subVectors(
        projectile.position,
        REST_POS,
      );
      const strength = Math.min(pull.length() * 3.5, 25);

      if (strength >= 0.5) {
        const vel = pull.clone().normalize().multiplyScalar(strength);
        const pos = projectile.position.clone();
        const grav = new THREE.Vector3(0, -9.81, 0);
        const step = 0.05;

        for (let i = 1; i <= 200; i++) {
          vel.addScaledVector(grav, step);
          pos.addScaledVector(vel, step);

          // Stop if it goes behind the camera — projecting those is garbage.
          const viewPos = pos.clone().applyMatrix4(camera.matrixWorldInverse);
          if (viewPos.z > -0.2) break;

          const s = pos.clone().project(camera);
          const sx = (s.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-s.y * 0.5 + 0.5) * window.innerHeight;

          if (i % 4 === 0) {
            aimCtx.fillStyle = "rgba(193, 18, 31, 0.45)";
            aimCtx.beginPath();
            aimCtx.arc(sx, sy, 3, 0, Math.PI * 2);
            aimCtx.fill();
          }

          // Landing marker — stop here, the arc is fully shown.
          if (pos.y <= BALL_R) {
            aimCtx.strokeStyle = "rgba(193, 18, 31, 0.85)";
            aimCtx.lineWidth = 2;
            aimCtx.beginPath();
            aimCtx.arc(sx, sy, 7, 0, Math.PI * 2);
            aimCtx.stroke();
            break;
          }

          // Off the play area horizontally — no landing to show.
          if (Math.abs(pos.x) > BOUND_XZ || Math.abs(pos.z) > BOUND_XZ) break;
        }
      }

      if (preview) {
        preview.textContent = strength.toFixed(0);
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  tick();
}

const canvas = document.querySelector("canvas.webgl");
if (!canvas) throw new Error("No canvas.webgl");
initLog29(canvas);
