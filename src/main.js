import * as THREE from 'three';
import { createRenderer, resizeViewport } from './core/renderer.js';
import { createCamera } from './core/camera.js';
import { createLighting } from './core/lighting.js';
import { createMaterialSystem } from './materials/materials.js';
import { createPrimitives } from './utils/primitives.js';

// Stage 3.1: the test object now uses the real legacy material/primitive helpers.
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
createLighting(scene);

const { mat } = createMaterialSystem();
const { cube: makeCube } = createPrimitives(scene);

// Temporary marker: next stages will replace it with the actual terrain.
const cube = makeCube(30, 30, 30, mat(0x00aa00), -4, 12, -25);

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  cube.rotation.y += 0.005;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
