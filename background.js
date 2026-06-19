import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"; // using GLTFLoader for more specific
// Addon is fine too
import gsap from "gsap";

export function initBackground() {
  const canvas = document.getElementById("bg-canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.z = 8;

  // Sync grid — sparse particle field
  const particleCount = 1200;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.025,
    color: 0x5c5950,
    transparent: true,
    opacity: 0.5,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // Background model (wireframe)
  const loader = new GLTFLoader();
  let model;
  const modelMaterials = [];

  loader.load(
    "/assets/mercedes_clr.glb",
    (gltf) => {
      model = gltf.scene;

      model.traverse((child) => {
        if (child.isMesh) {
          const mat = new THREE.MeshBasicMaterial({
            color: 0xc1121f,
            wireframe: true,
            transparent: true,
            opacity: 0,
          });
          child.material = mat;
          modelMaterials.push(mat);
        }
      });

      model.scale.set(0.45, 0.45, 0.45);
      model.position.set(2, -1.5, -9);
      model.rotation.z = Math.PI / 22;
      scene.add(model);

      // Ease in once loaded
      gsap.to(modelMaterials, {
        opacity: 0.045,
        duration: 1.6,
        ease: "power2.out",
        stagger: 0.01,
      });
    },
    undefined,
    (err) => {
      console.error("Background model failed to load:", err);
      // Fallback: wireframe torus so background isn't empty
      const fallbackGeo = new THREE.TorusGeometry(2, 0.5, 16, 60);
      const fallbackMat = new THREE.MeshBasicMaterial({
        color: 0xc1121f,
        wireframe: true,
        transparent: true,
        opacity: 0,
      });
      model = new THREE.Mesh(fallbackGeo, fallbackMat);
      modelMaterials.push(fallbackMat);
      model.position.set(2, -1.5, -9);
      scene.add(model);
      gsap.to(fallbackMat, {
        opacity: 0.07,
        duration: 1.6,
        ease: "power2.out",
      });
    },
  );

  let mouseX = 0,
    mouseY = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);

    particles.rotation.y += 0.0006;
    particles.rotation.x += 0.0002;

    if (model) {
      model.rotation.y += 0.0015;
    }

    camera.position.x += (mouseX * 0.6 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 0.6 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  animate();
}
