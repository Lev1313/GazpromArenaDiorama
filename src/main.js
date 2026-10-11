import * as THREE from 'three';
import { createRenderer, resizeViewport } from './core/renderer.js';
import { createCamera } from './core/camera.js';
import { createLighting } from './core/lighting.js';

// Stage 2: keep a simple visible marker until the actual geography is migrated.
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
createLighting(scene);

// Temporary test object at the original OrbitControls target.
// It is deliberately large enough to be visible from the legacy camera.
const geometry = new THREE.BoxGeometry(30, 30, 30);
const material = new THREE.MeshStandardMaterial({ color: 0x00aa00 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(-4, 12, -25);
cube.castShadow = true;
cube.receiveShadow = true;
scene.add(cube);

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  cube.rotation.y += 0.005;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
