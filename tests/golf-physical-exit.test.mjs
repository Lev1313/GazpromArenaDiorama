import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGolfDrive } from '../src/vehicles/golfDrive.js';

function setup() {
  const golf = new THREE.Group();
  golf.position.set(-22.4, 0, 16);
  golf.rotation.y = .1;
  golf.userData.frontWheels = [new THREE.Group(), new THREE.Group()];
  const golfLabel = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-115, 150, 190);
  const controls = {
    target: new THREE.Vector3(-4, 12, -25), enabled: true, updates: 0,
    update() { this.updates++; },
  };
  const drive = createGolfDrive({
    golf, golfLabel, camera, controls,
    parked: [golf], people: [], visitors: [], drifters: [],
    isDriveable: () => true,
    drift: { smokeEnabled: false, driftWaiting: false },
  });
  return { golf, golfLabel, camera, controls, drive };
}

test('physical Golf exit preserves the parked pose and clears all transient driving state', () => {
  const { golf, golfLabel, camera, controls, drive } = setup();
  drive.setDriving(true);
  golf.position.set(31.7, -.33, 42.1);
  golf.rotation.y = 1.37;
  const position = golf.position.clone();
  const yaw = golf.rotation.y;
  drive.setKey('KeyW', true);
  drive.setKey('Space', true);
  Object.assign(drive.state, {
    speed: .35, steer: .4, slip: -.25, contact: .6,
    skidTime: .11, lastRear: [new THREE.Vector3(), new THREE.Vector3()], view: 1,
  });
  golf.userData.frontWheels.forEach(wheel => { wheel.rotation.y = .4; });
  const cameraBefore = camera.position.clone();
  const targetBefore = controls.target.clone();
  const controlsBefore = { enabled: controls.enabled, updates: controls.updates };

  drive.stopDriving({ restoreCamera: false });

  assert.ok(golf.position.equals(position));
  assert.equal(golf.rotation.y, yaw);
  assert.deepEqual(drive.state, {
    active: false, speed: 0, steer: 0, view: 0, contact: 0,
    skidTime: 0, lastRear: null, slip: 0,
  });
  assert.equal(drive.keys.size, 0);
  assert.ok(golf.userData.frontWheels.every(wheel => wheel.rotation.y === 0));
  assert.equal(golfLabel.visible, true);
  assert.ok(camera.position.equals(cameraBefore));
  assert.ok(controls.target.equals(targetBefore));
  assert.equal(controls.enabled, controlsBefore.enabled);
  assert.equal(controls.updates, controlsBefore.updates);

  drive.setKey('KeyW', true);
  drive.updateDriving(1);
  assert.ok(golf.position.equals(position), 'Inactive driving cannot move the exited car');
  assert.equal(drive.keys.size, 0);
});

test('physical Golf exit optionally restores its saved camera without resetting the car', () => {
  const { golf, camera, controls, drive } = setup();
  const cameraHome = camera.position.clone();
  const targetHome = controls.target.clone();
  drive.setDriving(true);
  golf.position.set(12, 0, 20);
  golf.rotation.y = -.7;
  drive.stopDriving();
  assert.deepEqual(golf.position.toArray(), [12, 0, 20]);
  assert.equal(golf.rotation.y, -.7);
  assert.ok(camera.position.equals(cameraHome));
  assert.ok(controls.target.equals(targetHome));
  assert.equal(controls.enabled, true);
});

test('re-entering a physically exited Golf starts from its current parking pose', () => {
  const { golf, controls, drive } = setup();
  drive.setDriving(true);
  golf.position.set(31, 0, 43);
  golf.rotation.y = .6;
  drive.stopDriving({ restoreCamera: false });
  drive.setDriving(true);
  assert.equal(drive.state.active, true);
  assert.equal(drive.state.speed, 0);
  assert.equal(controls.enabled, false);
  assert.deepEqual(golf.position.toArray(), [31, 0, 43]);
  assert.equal(golf.rotation.y, .6);
});

test('legacy Golf exit and explicit R reset still return to the original pose', () => {
  const { golf, golfLabel, camera, controls, drive } = setup();
  const home = golf.position.clone(), yawHome = golf.rotation.y;
  const cameraHome = camera.position.clone(), targetHome = controls.target.clone();
  drive.setDriving(true);
  golf.position.set(30, -.33, 41);
  golf.rotation.y = 1.2;
  drive.setKey('KeyW', true);
  drive.setDriving(false);
  assert.ok(golf.position.equals(home));
  assert.equal(golf.rotation.y, yawHome);
  assert.ok(camera.position.equals(cameraHome));
  assert.ok(controls.target.equals(targetHome));
  assert.equal(controls.enabled, true);
  assert.equal(golfLabel.visible, true);
  assert.equal(drive.keys.size, 0);

  drive.setDriving(true);
  golf.position.set(29, -.33, 45);
  golf.rotation.y = -1;
  drive.resetGolf();
  assert.ok(golf.position.equals(home));
  assert.equal(golf.rotation.y, yawHome);
  assert.equal(drive.state.active, true, 'R reset keeps the driver in control');
});
