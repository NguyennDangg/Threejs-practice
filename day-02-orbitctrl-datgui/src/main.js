import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/Addons.js'
import * as dat from 'dat.gui'

// ── Scene ──────────────────────────────────────
const scene = new THREE.Scene()

// ── Camera ────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.z = 3

// ── Mesh ──────────────────────────────────────
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshStandardMaterial({ color: 0x00ffff })
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

// ── Light ─────────────────────────────────────
const light = new THREE.PointLight(0xffffff, 100)
light.position.set(5, 5, 5)
scene.add(light)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
scene.add(ambientLight)

// ── Renderer ──────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

// ── OrbitControls ─────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true      // smooth deceleration
controls.dampingFactor = 0.05
controls.autoRotate = false        // try setting this to true
controls.enablePan = false         // disable right-click drag

// ── dat.GUI ───────────────────────────────────
const gui = new dat.GUI()

// Cube rotation sliders
const cubeFolder = gui.addFolder('Cube')
cubeFolder.add(cube.rotation, 'x', 0, Math.PI * 2).name('rotate X')
cubeFolder.add(cube.rotation, 'y', 0, Math.PI * 2).name('rotate Y')
cubeFolder.add(cube.rotation, 'z', 0, Math.PI * 2).name('rotate Z')
cubeFolder.add(material, 'wireframe')
cubeFolder.open()

// Color picker
const colorParams = { color: '#00ffff' }
cubeFolder.addColor(colorParams, 'color').onChange((val) => {
  material.color.set(val)
})

// Light controls
const lightFolder = gui.addFolder('Light')
lightFolder.add(light.position, 'x', -10, 10)
lightFolder.add(light.position, 'y', -10, 10)
lightFolder.add(light.position, 'z', -10, 10)
lightFolder.add(light, 'intensity', 0, 200)
lightFolder.open()

// ── Clock (delta time) ────────────────────────
const clock = new THREE.Clock()

// ── Resize ────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

// ── Animate ───────────────────────────────────
const animate = () => {
  requestAnimationFrame(animate)

  const delta = clock.getDelta()

  // Speed is now per-second not per-frame
  // works the same on 60fps and 144fps monitors
  cube.rotation.y += 0.5 * delta

  controls.update() // required when enableDamping is true
  renderer.render(scene, camera)
}

animate()