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
import { replaceWithParkedGla } from './vehicles/parkedGlaModel.js';
import { createDriftSystem } from './vehicles/drift.js';
import { createTrafficSystem } from './vehicles/traffic.js';
import { createVehicleDrive } from './vehicles/vehicleDrive.js';
import { installDriveUi } from './ui/driveUi.js';
import { createHudController } from './ui/hudController.js';
import { installFullHud } from './ui/fullHud.js';
import { createPedestrian } from './player/pedestrian.js';
import { createControlModes } from './player/controlModes.js';
import { installPedestrianUi } from './ui/pedestrianUi.js';
import { captureGroundSurface } from './player/groundSurface.js';
import { createVehicleRegistry } from './vehicles/vehicleSeats.js';
import { createVehicleInteraction } from './player/vehicleInteraction.js';
import { installVehicleInteractionUi } from './ui/vehicleInteractionUi.js';
import { createMultiplayer } from './network/multiplayer.js';
import { installMultiplayerUi } from './ui/multiplayerUi.js';
import { installVehiclePicker } from './ui/vehiclePicker.js';

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
// Keep compact-car projections unchanged; the GL has a taller roof envelope.
const tallVehicleObstacles = groundObstacles(scene, 1.92);
const pedestrianObstacles = groundObstacles(scene, 1.85);
const pedestrianGround = captureGroundSurface(scene);

// Exact legacy order: geometry batching first, then disable material sharing
// so later car paint materials are not accidentally shared.
const staticBatchCount = batchArchitecture(scene);
stopSharingStaticMaterials();
scene.userData.staticBatchCount = staticBatchCount;

// Following the original order: dynamic car paint after material cache is disabled.
const carFactory = createCarFactory(scene, mat);
const { parked, people, markings, golf, golfLabel, staticCount } = createParkingMeet(scene, mat, materials, carFactory);
const vehicleRegistry = createVehicleRegistry(parked);
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
replaceWithParkedGla(parked[18]).then(() => {
  canvas.dataset.glaModel = 'loaded';
}).catch(error => {
  canvas.dataset.glaModel = 'failed';
  console.error('Unable to load parked GLA model', error);
});
scene.userData.spectators = people.length;

// The original scene constructs highway/visitor traffic before drifters.
const traffic = createTrafficSystem(scene, carFactory, highway, markings);
scene.userData.highwayCars = traffic.highCars.length;
scene.userData.visitors = traffic.visitors.length;

// Dynamic drift objects are created only after static architecture batching.
const drift = createDriftSystem(scene, carFactory);
scene.userData.drifters = drift.drifters.length;

const pavedArea = driveArea(parkingOutline);
const drive = createVehicleDrive({
  golf, golfLabel, parked, people,
  visitors: traffic.visitors, drifters: drift.drifters,
  drift, camera, controls, lotOutline: parkingOutline,
  isDriveable: freeDriveArea(islandOutline), staticObstacles,
  getStaticObstacles: footprint => (footprint.height ?? 1.7) > 1.7 ? tallVehicleObstacles : staticObstacles,
  getGroundHeight: (x,z) => pavedArea(x,z) || (x>=-14.5 && x<=-5.5 && z>=-49.5 && z<=-38.5)
    ? 0 : Math.hypot(x-arenaX,z)<=36 ? -.13 : -.33,
});
const pedestrian = createPedestrian({
  scene, camera, controls, parked, people, visitors: traffic.visitors, drifters: drift.drifters,
  staticObstacles: pedestrianObstacles, parkingOutline, islandOutline,
  isWalkable: freeDriveArea(islandOutline),
  getGroundHeight: pedestrianGround,
});
const modes = createControlModes(drive, pedestrian);
const seating = createVehicleInteraction({registry:vehicleRegistry,pedestrian,drive,modes,camera,controls});
const root = document.getElementById('app');
const driveUi = installDriveUi(root, drive);
let multiplayer;
const updateHeadlights = configureNightLighting(scene, { arenaX, headlightCars: [
  {get car(){return drive.golf;},isActive:()=>drive.state.active,projector:true},
  {get car(){return multiplayer?.remoteDriver??golf;},isActive:()=>Boolean(multiplayer?.remoteDriver)},
  ...drift.drifters.map((c,i)=>({car:c.o,isActive:()=>true,projector:i===0})),
  ...traffic.highCars.map(c=>({car:c.o,isActive:()=>true})),
  ...traffic.visitors.map(c=>({car:c.o,isActive:()=>c.delay===0 && c.state!=='park'})),
] });
const hud = createHudController({
  scene, renderer, camera, controls, hemi, sun, arenaX,
  drift, traffic, drive, staticCount, people, pedestrian, modes,
});
const fullHud = installFullHud(root, hud, driveUi, drive);
const pedestrianUi = installPedestrianUi(root, pedestrian, modes, hud, canvas);
const seatingUi = installVehicleInteractionUi(root, seating, drive, hud);
multiplayer = createMultiplayer({scene,pedestrian,modes,hud,registry:vehicleRegistry,drive,seating,drift});
const multiplayerUi = installMultiplayerUi(root,multiplayer);
const vehiclePicker = installVehiclePicker(root,{scene,camera,registry:vehicleRegistry,pedestrian,seating,drive,multiplayer});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.max(0, (now - last) / 1000);
  const dt = Math.min(elapsed, .06);
  // Walking keeps real elapsed time even below 17 FPS; bound long tab stalls.
  const walkDt = Math.min(elapsed, .25);
  last = now;
  // Original order and timing: Golf uses real dt; traffic and drifting
  // use simulation dt multiplied by the user-selected tempo.
  if (hud.state.running) {
    drive.updateDriving(dt);
    const simDt = dt * hud.state.speedScale;
    // A physically parked Golf remains an obstacle after its driver gets out.
    const golfBlocking = seating.golfBlocksTraffic();
    const obstacles = parked;
    traffic.update(simDt, { driving: golfBlocking, golfPosition: drive.golf.position, obstacles });
    drift.update(simDt, {
      people, driving: golfBlocking, golfPosition: drive.golf.position, obstacles,
    });
    pedestrian.update(walkDt);
  }
  updateHeadlights();
  multiplayer.update(walkDt);
  seating.update(hud.state.running ? walkDt : 0);
  if (pedestrian.state.active) {
    pedestrian.updateCamera(walkDt);
  } else if (seating.isSeated() && !drive.state.active) {
    seating.updateCamera(walkDt);
  } else if (drive.state.active && drive.state.view !== 2) {
    drive.updateDriveCamera(dt);
  } else {
    controls.update();
  }
  driveUi.render();
  fullHud.render();
  pedestrianUi.render();
  seatingUi.render();
  multiplayerUi.render();
  vehiclePicker.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => resizeViewport(renderer, camera));
