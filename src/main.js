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
import { createGolfDrive } from './vehicles/golfDrive.js';
import { installDriveUi } from './ui/driveUi.js';

// Stage 4.4: drive the silver Golf VI in the modular parking meet.
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
createLighting(scene);

const { mat, stopSharingStaticMaterials } = createMaterialSystem();
const { materials, arenaX, islandOutline, parkingOutline } = createTerrain(scene, mat);
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
const { parked, people, markings, golf, golfLabel } = createParkingMeet(scene, mat, materials, carFactory);
scene.userData.parkedCars = parked.length;
scene.userData.spectators = people.length;

// The original scene constructs highway/visitor traffic before drifters.
const traffic = createTrafficSystem(scene, carFactory, highway, markings);
scene.userData.highwayCars = traffic.highCars.length;
scene.userData.visitors = traffic.visitors.length;

// Dynamic drift objects are created only after static architecture batching.
const drift = createDriftSystem(scene, carFactory);
scene.userData.drifters = drift.drifters.length;

const drive = createGolfDrive({
  golf, golfLabel, parked, people,
  visitors: traffic.visitors, drifters: drift.drifters,
  drift, camera, controls, lotOutline: parkingOutline,
});
const driveUi = installDriveUi(document.getElementById('app'), drive);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((now - last) / 1000, .06));
  last = now;
  // Original update order: Golf physics -> moving traffic -> drifters.
  drive.updateDriving(dt);
  traffic.update(dt, { driving: drive.state.active, golfPosition: golf.position });
  drift.update(dt, {
    people, driving: drive.state.active, golfPosition: golf.position,
  });
  if (drive.state.active && drive.state.view !== 2) {
    drive.updateDriveCamera(dt);
  } else {
    controls.update();
  }
  driveUi.render();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
