import * as THREE from 'three';
import { createRenderer, resizeViewport } from './core/renderer.js';
import { createCamera } from './core/camera.js';
import { createLighting, configureNightLighting } from './core/lighting.js';
import { createMaterialSystem } from './materials/materials.js';
import { createTerrain } from './world/terrain.js';
import { driveArea, freeDriveArea, groundObstacles } from './world/siteLayout.js';
import { createStadium } from './world/stadium.js';
import { createZsd } from './world/zsd.js';
import { createLakhta } from './world/lakhta.js';
import { createSurroundings } from './world/surroundings.js';
import { batchArchitecture } from './core/batching.js';
import { createCarFactory } from './vehicles/car.js';
import { createParkingMeet } from './world/parkingMeet.js';
import { replaceWithParkedGolf } from './vehicles/parkedGolfModel.js';
import { replaceWithParkedLexus } from './vehicles/parkedLexusModel.js';
import { replaceWithParkedMercedes } from './vehicles/parkedMercedesModel.js';
import { createDriftSystem } from './vehicles/drift.js';
import { createTrafficSystem } from './vehicles/traffic.js';
import { createGolfDrive } from './vehicles/golfDrive.js';
import { installDriveUi } from './ui/driveUi.js';
import { createHudController } from './ui/hudController.js';
import { installFullHud } from './ui/fullHud.js';

// Stage 4.5: restore the original HUD on top of the complete modular scene.
const canvas = document.createElement('canvas');
canvas.id = 'view';
document.getElementById('app').appendChild(canvas);

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const { camera, controls } = createCamera(canvas);
const { hemi, sun } = createLighting(scene);

const { mat, stopSharingStaticMaterials } = createMaterialSystem();
const { materials, arenaX, islandOutline, parkingOutline } = createTerrain(scene, mat);
const { steel } = createStadium(scene, mat, materials, arenaX);
const highway = createZsd(scene, mat, materials);
createLakhta(scene, mat, materials, steel);
createSurroundings(scene, mat, materials, arenaX, islandOutline, steel);
const staticObstacles = groundObstacles(scene);

// Exact legacy order: geometry batching first, then disable material sharing
// so later car paint materials are not accidentally shared.
const staticBatchCount = batchArchitecture(scene);
stopSharingStaticMaterials();
scene.userData.staticBatchCount = staticBatchCount;

// Following the original order: dynamic car paint after material cache is disabled.
const carFactory = createCarFactory(scene, mat);
const { parked, people, markings, golf, golfLabel, staticCount } = createParkingMeet(scene, mat, materials, carFactory);
await replaceWithParkedGolf(parked[2]).catch(error => console.error('Unable to load parked Golf model', error));
replaceWithParkedLexus(parked[17]).then(() => {
  canvas.dataset.lexusModel = 'loaded';
}).catch(error => {
  canvas.dataset.lexusModel = 'failed';
  console.error('Unable to load parked Lexus model', error);
});
replaceWithParkedMercedes(parked[16]).then(() => {
  canvas.dataset.mercedesModel = 'loaded';
}).catch(error => {
  canvas.dataset.mercedesModel = 'failed';
  console.error('Unable to load parked Mercedes model', error);
});
scene.userData.parkedCars = parked.length;
scene.userData.spectators = people.length;

// The original scene constructs highway/visitor traffic before drifters.
const traffic = createTrafficSystem(scene, carFactory, highway, markings);
scene.userData.highwayCars = traffic.highCars.length;
scene.userData.visitors = traffic.visitors.length;

// Dynamic drift objects are created only after static architecture batching.
const drift = createDriftSystem(scene, carFactory);
scene.userData.drifters = drift.drifters.length;

const pavedArea = driveArea(parkingOutline);
const drive = createGolfDrive({
  golf, golfLabel, parked, people,
  visitors: traffic.visitors, drifters: drift.drifters,
  drift, camera, controls, lotOutline: parkingOutline,
  isDriveable: freeDriveArea(islandOutline), staticObstacles,
  getGroundHeight: (x,z) => pavedArea(x,z) || (x>=-14.5 && x<=-5.5 && z>=-49.5 && z<=-38.5)
    ? 0 : Math.hypot(x-arenaX,z)<=36 ? -.13 : -.33,
});
const root = document.getElementById('app');
const driveUi = installDriveUi(root, drive);
const updateHeadlights = configureNightLighting(scene, { arenaX, headlightCars: [
  {car:golf,isActive:()=>drive.state.active,projector:true},
  ...drift.drifters.map((c,i)=>({car:c.o,isActive:()=>true,projector:i===0})),
  ...traffic.highCars.map(c=>({car:c.o,isActive:()=>true})),
  ...traffic.visitors.map(c=>({car:c.o,isActive:()=>c.delay===0 && c.state!=='park'})),
] });
const hud = createHudController({
  scene, renderer, camera, controls, hemi, sun, arenaX,
  drift, traffic, drive, staticCount, people,
});
const fullHud = installFullHud(root, hud, driveUi, drive);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min((now - last) / 1000, .06));
  last = now;
  // Original order and timing: Golf uses real dt; traffic and drifting
  // use simulation dt multiplied by the user-selected tempo.
  if (hud.state.running) {
    drive.updateDriving(dt);
    const simDt = dt * hud.state.speedScale;
    traffic.update(simDt, { driving: drive.state.active, golfPosition: golf.position });
    drift.update(simDt, {
      people, driving: drive.state.active, golfPosition: golf.position,
    });
  }
  updateHeadlights();
  if (drive.state.active && drive.state.view !== 2) {
    drive.updateDriveCamera(dt);
  } else {
    controls.update();
  }
  driveUi.render();
  fullHud.render();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
