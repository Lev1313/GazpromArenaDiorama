import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parkingOutline } from '../src/world/terrain.js';
import { driveArea, arenaX, accessOutlines, accessWidth, eastArrival } from '../src/world/siteLayout.js';
import { createMaterialSystem, createBaseMaterials } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createParkingMeet } from '../src/world/parkingMeet.js';

test('three accesses have equal constant width and mirror symmetry', () => {
  assert.equal(accessWidth, 6);
  for (const polygon of accessOutlines) {
    assert.equal(Math.max(...polygon.map(p => p[1])) - Math.min(...polygon.map(p => p[1])), accessWidth);
    assert.equal(polygon[0][1], polygon[1][1]);
    assert.equal(polygon[2][1], polygon[3][1]);
  }
  const sorted = p => p.map(([x,z]) => `${x},${z}`).sort();
  assert.deepEqual(sorted(accessOutlines[0].map(([x,z]) => [x,-z])), sorted(accessOutlines[2]));
  assert.deepEqual(sorted(accessOutlines[1].map(([x,z]) => [x,-z])), sorted(accessOutlines[1]));
});

test('east approach connects the future arrival point to the ring within the scene boundary', () => {
  const { controller: drive, golf } = setup({ isDriveable: driveArea(parkingOutline) });
  for (const z of [30.5, 33.5]) for (let x = 50; x <= 86; x += .25) {
    assert.equal(drive.blocked(new THREE.Vector3(x, 0, z), Math.PI), false, `East lane ${x},${z}`);
  }
  assert.equal(drive.blocked(new THREE.Vector3(88, 0, 32), 0), true, 'Car cannot cross the board edge');
  assert.equal(drive.blocked(new THREE.Vector3(86, 0, 38), 0), true, 'No driving over the roadside');
  drive.setDriving(true);
  golf.position.set(eastArrival.stagingX, 0, eastArrival.z);
  golf.rotation.y = Math.PI;
  drive.setKey('KeyW', true);
  for (let i = 0; i < 260; i++) drive.updateDriving(1 / 60);
  assert.ok(golf.position.x < 52, 'Controller reaches the ring from the eastern staging point');
  assert.equal(drive.state.contact, 0);
});

test('new middle and south accesses clear actual parked cars and spectators', () => {
  const scene = new THREE.Scene();
  const { mat } = createMaterialSystem();
  const meet = createParkingMeet(scene, mat, createBaseMaterials(mat), createCarFactory(scene, mat), {
    makeLabel: () => new THREE.Sprite(new THREE.SpriteMaterial()),
  });
  const { controller: drive } = setup({ isDriveable: driveArea(parkingOutline), parked: meet.parked, people: meet.people });
  const clear = (x, z, yaw) => assert.equal(drive.blocked(new THREE.Vector3(x, 0, z), yaw), false, `Blocked ${x}, ${z}`);
  for (let x = 0; x <= 16.5; x += .25) clear(x, 0, 0);
  for (let i = 0; i <= 90; i++) {
    const a = (90 - i) * Math.PI / 180;
    clear(16.5 + 3 * Math.cos(a), -3 + 3 * Math.sin(a), Math.PI / 2 - a);
  }
  for (let x = 6; x <= 50; x += .25) {
    clear(x, 31, 0);
  }
});

test('Golf footprint can cross the access road and complete a ring lap without entering the podium', () => {
  const { controller: drive, golf } = setup({ isDriveable: driveArea(parkingOutline) });
  for (let x = 5; x <= arenaX; x += .25) {
    assert.equal(drive.blocked(new THREE.Vector3(x, 0, -30.5), 0), false, `Access at x=${x}`);
  }
  for (const radius of [30.5, 33.5]) for (let i = 0; i < 360; i++) {
    const a = i * Math.PI / 180;
    const pos = new THREE.Vector3(arenaX + radius * Math.cos(a), 0, radius * Math.sin(a));
    assert.equal(drive.blocked(pos, -a - Math.PI / 2), false, `Ring at ${i} degrees`);
  }
  assert.equal(drive.blocked(new THREE.Vector3(arenaX, 0, 0), 0), true);
  assert.equal(drive.blocked(new THREE.Vector3(13, 0, 12), 0), true, 'No shortcut across the grass');
  assert.equal(drive.blocked(new THREE.Vector3(arenaX + 37, 0, 0), 0), true);
  drive.setDriving(true);
  golf.position.set(5, 0, -30.5);
  golf.rotation.y = 0;
  drive.setKey('KeyW', true);
  for (let i = 0; i < 160; i++) drive.updateDriving(1 / 60);
  assert.ok(golf.position.x > 20, 'Actual controller crosses the former parking boundary');
  assert.equal(drive.state.contact, 0);
});
import {
  createGolfDrive, pointInLot, carOverlap, circleOverlap, viewNames,
} from '../src/vehicles/golfDrive.js';

function setup(options = {}) {
  const golf = new THREE.Group();
  golf.position.set(-22.4, 0, 16);
  golf.userData.frontWheels = [new THREE.Group(), new THREE.Group()];
  const golfLabel = new THREE.Sprite(new THREE.SpriteMaterial());
  golfLabel.visible = true;
  const camera = new THREE.PerspectiveCamera(44, 1, .1, 450);
  camera.position.set(-115, 150, 190);
  const controls = {
    target: new THREE.Vector3(-4, 12, -25),
    enabled: true,
    updated: 0,
    update() { this.updated++; },
  };
  const parked = [golf], people = [], visitors = [], drifters = [];
  const effects = { skids: 0, refreshes: 0, smoke: 0 };
  const drift = {
    driftWaiting: false,
    smokeEnabled: true,
    rearPoints(car) {
      return [-.65, .65].map(z => new THREE.Vector3(-1.25, .015, z)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y)
        .add(car.position));
    },
    addSkid() { effects.skids++; },
    refreshSkids() { effects.refreshes++; },
    emitSmoke() { effects.smoke++; },
  };
  const controller = createGolfDrive({
    golf, golfLabel, parked, people, visitors, drifters, drift,
    camera, controls, lotOutline: parkingOutline,
    ...options,
  });
  return {
    controller, golf, golfLabel, camera, controls, parked, people,
    visitors, drifters, drift, effects,
  };
}

test('parking shape and rotated car footprint preserve collision behaviour', () => {
  assert.equal(pointInLot(-8, 0, parkingOutline), true);
  assert.equal(pointInLot(50, 0, parkingOutline), false);
  assert.equal(pointInLot(-10, -60, parkingOutline), false);
  assert.equal(viewNames.length, 3);
  const other = new THREE.Group();
  other.position.set(0, 0, 0);
  assert.equal(carOverlap(new THREE.Vector3(3, 0, 0), 0, other), true);
  assert.equal(carOverlap(new THREE.Vector3(10, 0, 0), 0, other), false);
  assert.equal(circleOverlap(new THREE.Vector3(0, 0, 0), 0, 0, 0, .5), true);
  assert.equal(circleOverlap(new THREE.Vector3(0, 0, 0), 0, 10, 10, .5), false);
});

test('Golf enters drive mode, accelerates and shows D with km/h', () => {
  const { controller: drive, golf, golfLabel, controls } = setup();
  assert.equal(drive.state.active, false);
  drive.setDriving(true);
  assert.equal(drive.state.active, true);
  assert.equal(controls.enabled, false);
  assert.equal(golfLabel.visible, false);

  drive.setKey('KeyW', true);
  for (let i = 0; i < 15; i++) drive.updateDriving(.06);
  assert.ok(drive.state.speed > 2);
  assert.ok(drive.getStatus().speedKmh > 10);
  assert.equal(drive.getStatus().gear, 'D');
  assert.ok(golf.position.x > -22.4);
  assert.equal(drive.keys.has('KeyW'), true);
  drive.setKey('KeyW', false);
  assert.equal(drive.keys.has('KeyW'), false);
});

test('reverse gear, reset and exit restore the original position and camera', () => {
  const { controller: drive, golf, golfLabel, camera, controls } = setup();
  const cameraHome = camera.position.clone();
  const targetHome = controls.target.clone();
  drive.setDriving(true);
  drive.setKey('KeyS', true);
  for (let i = 0; i < 12; i++) drive.updateDriving(.06);
  assert.ok(drive.state.speed < -.1);
  assert.equal(drive.getStatus().gear, 'R');

  drive.resetGolf();
  assert.deepEqual(golf.position.toArray(), [-22.4, 0, 16]);
  assert.equal(drive.getStatus().gear, 'N');
  assert.equal(drive.getStatus().speedKmh, 0);
  assert.equal(drive.keys.size, 0);
  drive.setDriving(false);
  assert.equal(drive.state.active, false);
  assert.equal(golfLabel.visible, true);
  assert.equal(controls.enabled, true);
  assert.deepEqual(camera.position.toArray(), cameraHome.toArray());
  assert.deepEqual(controls.target.toArray(), targetHome.toArray());
});

test('drive camera cycles chase, top and free without breaking OrbitControls', () => {
  const { controller: drive, camera, controls } = setup();
  drive.setDriving(true);
  assert.equal(drive.getStatus().viewName, 'Сзади');
  drive.cycleDriveView();
  assert.equal(drive.getStatus().viewName, 'Сверху');
  assert.equal(controls.enabled, false);
  assert.ok(camera.position.y > 15);
  drive.cycleDriveView();
  assert.equal(drive.getStatus().viewName, 'Свободно');
  assert.equal(controls.enabled, true);
  drive.cycleDriveView();
  assert.equal(drive.getStatus().viewName, 'Сзади');
  assert.equal(controls.enabled, false);
  drive.setDriving(false);
  drive.cycleDriveView();
  assert.equal(drive.state.view, 0);
});

test('parked vehicles and lot boundary stop Golf without crossing obstacles', () => {
  const { controller: drive, golf, parked } = setup();
  const obstacle = new THREE.Group();
  obstacle.position.set(-17.5, 0, 16);
  parked.push(obstacle);
  drive.setDriving(true);
  drive.setKey('KeyW', true);
  for (let i = 0; i < 100; i++) drive.updateDriving(.06);
  assert.ok(golf.position.x < obstacle.position.x);
  assert.equal(drive.state.speed, 0);
  assert.ok(drive.state.contact > 0);
  assert.equal(drive.getStatus().message, 'Препятствие — сдай назад');

  drive.resetGolf();
  parked.pop();
  // The car footprint goes beyond the west side of the lot at this point.
  assert.equal(drive.blocked(new THREE.Vector3(-28, 0, 0), 0), true);
});

test('braking creates skid/smoke effects and keys clear when leaving', () => {
  const { controller: drive, effects, drift } = setup();
  drive.setDriving(true);
  drive.setKey('KeyW', true);
  for (let i = 0; i < 22; i++) drive.updateDriving(.06);
  assert.ok(drive.state.speed > 6);
  drive.setKey('KeyW', false);
  drive.setKey('Space', true);
  for (let i = 0; i < 4; i++) drive.updateDriving(.06);
  assert.ok(effects.skids > 0);
  assert.ok(effects.refreshes > 0);
  assert.ok(effects.smoke > 0);

  drift.driftWaiting = true;
  assert.equal(drive.getStatus().message, 'Дрифтеры пропускают тебя');
  drive.setDriving(false);
  assert.equal(drive.keys.size, 0);
  assert.equal(drive.state.active, false);
});
