import * as THREE from 'three'

// Scene — the empty stage
const scene = new THREE.Scene()

// Camera — your eyes into the world
// args: field of view, aspect ratio, near clip, far clip
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.z = 3  // step back so we're not inside the cube

// Geometry = shape (pure math, no color)
// Material = appearance
// Mesh = geometry + material combined
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  wireframe: true   // show edges only — good for understanding 3D structure
})
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)   // nothing shows until you add it to the scene

// Renderer — what actually draws everything to the screen
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)  // injects <canvas> into body

// Resize handler — keep everything in sync when browser resizes
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()  // always call this after touching camera props
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// Animation loop — the heartbeat of every Three.js scene
// requestAnimationFrame syncs to screen refresh rate (~60fps)
// and auto-pauses when the tab is hidden
const animate = () => {
  requestAnimationFrame(animate)  // schedules the next frame (creates the loop)
  cube.rotation.x += 0.005
  cube.rotation.y += 0.008
  renderer.render(scene, camera)
}

animate()  // first call — starts the chain