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
import { batchArchitecture } from './core/batching.js';
import { createCarFactory } from './vehicles/car.js';
import { createParkingMeet } from './world/parkingMeet.js';
import { createDriftSystem } from './vehicles/drift.js';
import { createTrafficSystem } from './vehicles/traffic.js';

// Stage 4.3: static diorama, parked cars, drifting cars and original moving traffic.
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
createLighting(scene);

const { mat, stopSharingStaticMaterials } = createMaterialSystem();
const { materials, arenaX, islandOutline } = createTerrain(scene, mat);
const { steel } = createStadium(scene, mat, materials, arenaX);
const highway = createZsd(scene, mat, materials);
createLakhta(scene, mat, materials, steel);
createSurroundings(scene, mat, materials, arenaX, islandOutline, steel);

// Exact legacy order: geometry batching first, then disable material sharing
// so later car paint materials are not accidentally shared.
const staticBatchCount = batchArchitecture(scene);
stopSharingStaticMaterials();
scene.userData.staticBatchCount = staticBatchCount;

// Following the original order: dynamic car paint after material cache is disabled.
const carFactory = createCarFactory(scene, mat);
const { parked, people, markings } = createParkingMeet(scene, mat, materials, carFactory);
scene.userData.parkedCars = parked.length;
scene.userData.spectators = people.length;

// The original scene constructs highway/visitor traffic before drifters.
const traffic = createTrafficSystem(scene, carFactory, highway, markings);
scene.userData.highwayCars = traffic.highCars.length;
scene.userData.visitors = traffic.visitors.length;

// Dynamic drift objects are created only after static architecture batching.
const drift = createDriftSystem(scene, carFactory);
scene.userData.drifters = drift.drifters.length;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((now - last) / 1000, .06));
  last = now;
  traffic.update(dt);
  drift.update(dt, { people });
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
