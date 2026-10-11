import * as THREE from 'three';
import { createRenderer, resizeViewport } from './core/renderer.js';
import { createCamera } from './core/camera.js';
import { createLighting } from './core/lighting.js';
import { createMaterialSystem } from './materials/materials.js';
import { createTerrain } from './world/terrain.js';
import { createStadium } from './world/stadium.js';
import { createZsd } from './world/zsd.js';

// Stage 3.4: original terrain, arena and ZSD; vehicles and other landmarks follow.
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
createLighting(scene);

const { mat } = createMaterialSystem();
const { materials, arenaX } = createTerrain(scene, mat);
createStadium(scene, mat, materials, arenaX);
createZsd(scene, mat, materials);

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
