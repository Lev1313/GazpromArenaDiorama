import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { parkingOutline } from '../src/world/terrain.js';
import {
  createGolfDrive, pointInLot, carOverlap, circleOverlap, viewNames,
} from '../src/vehicles/golfDrive.js';

function setup() {
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
