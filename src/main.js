import * as THREE from 'three';
import { createRenderer, resizeViewport } from './core/renderer.js';
import { createCamera } from './core/camera.js';
import { createLighting } from './core/lighting.js';
import { createMaterialSystem } from './materials/materials.js';
import { createTerrain } from './world/terrain.js';
import { createStadium } from './world/stadium.js';
import { createZsd } from './world/zsd.js';
import { createLakhta } from './world/lakhta.js';
import { createSurroundings } from './world/surroundings.js';

// Stage 3.5: original static environment (before batching and vehicle migration).
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
createLighting(scene);

const { mat } = createMaterialSystem();
const { materials, arenaX, islandOutline } = createTerrain(scene, mat);
const { steel } = createStadium(scene, mat, materials, arenaX);
createZsd(scene, mat, materials);
createLakhta(scene, mat, materials, steel);
createSurroundings(scene, mat, materials, arenaX, islandOutline, steel);

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
