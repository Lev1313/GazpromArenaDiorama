import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPedestrian } from '../src/player/pedestrian.js';
import { createControlModes } from '../src/player/controlModes.js';
import { createVehicleInteraction, safeExitSpeed } from '../src/player/vehicleInteraction.js';
import { createVehicleRegistry } from '../src/vehicles/vehicleSeats.js';
import { createGolfDrive } from '../src/vehicles/golfDrive.js';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createDriftSystem, driftPose } from '../src/vehicles/drift.js';

const land = [[-100, -100], [100, -100], [100, 100], [-100, 100]];

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(-115, 150, 190);
  const controls = {
    target: new THREE.Vector3(-4, 12, -25), enabled: true, enableDamping: true,
    update() {},
  };
  const parked = Array.from({ length: 18 }, (_, index) => {
    const car = new THREE.Group();
    car.position.set((index % 6) * 12 - 30, 0, 45 + Math.floor(index / 6) * 12);
    car.rotation.y = index === 5 ? 0 : index * .23;
    car.userData.frontWheels = [new THREE.Group(), new THREE.Group()];
    car.userData.footprint = index === 2 ? { halfLength: 2.1375, halfWidth: 1.0395 }
      : index === 16 ? { halfLength: 2.56, halfWidth: 1.132 }
        : index === 17 ? { halfLength: 2.4327, halfWidth: 1.0763 }
          : { halfLength: 1.96, halfWidth: 1.04 };
    scene.add(car);
    return car;
  });
  const pedestrian = createPedestrian({ scene, camera, controls, parked,
    parkingOutline: land, islandOutline: land, getGroundHeight: () => -.12 });
  const drive = createGolfDrive({ golf: parked[5], camera, controls, parked,
    people: [], visitors: [], drifters: [], isDriveable: () => true,
    drift: { smokeEnabled: false, driftWaiting: false,
      rearPoints: car => [car.position.clone(), car.position.clone()],
      addSkid() {}, refreshSkids() {} },
  });
  const modes = createControlModes(drive, pedestrian);
  const registry = createVehicleRegistry(parked);
  const interaction = createVehicleInteraction({ registry, pedestrian, drive, modes, camera, controls });
  assert.equal(modes.walk(true), true);
  return { scene, camera, controls, parked, pedestrian, drive, modes, registry, interaction };
}

function approach(f, index, seatId = 'driver') {
  const vehicle = f.registry.vehicles[index];
  const seat = vehicle.seats.find(s => s.seatId === seatId);
  const entry = f.registry.worldPosition(vehicle, seat);
  assert.equal(f.pedestrian.resumeAt(entry), true, `Free entry for ${index}/${seatId}`);
  const target = f.interaction.nearest();
  assert.equal(target?.vehicle, vehicle);
  assert.equal(target?.seat, seat);
  return { vehicle, seat, entry, target };
}

function assertPose(f, vehicle, seat) {
  const expectedPosition = f.registry.worldPosition(vehicle, seat, 'localPosition');
  const origin = vehicle.car.localToWorld(new THREE.Vector3());
  const forward = vehicle.car.localToWorld(new THREE.Vector3(1, 0, 0)).sub(origin);
  const expectedYaw = Math.atan2(forward.x, forward.z);
  assert(f.pedestrian.model.position.distanceTo(expectedPosition) < 1e-10);
  assert(Math.abs(f.pedestrian.model.rotation.y - expectedYaw) < 1e-10);
  assert.equal(f.pedestrian.state.yaw, f.pedestrian.model.rotation.y);
}

test('all 18 specific parked cars support driver seating and nearby safe exit; all drivers activate the selected car', () => {
  const f = fixture();
  for (let index = 0; index < 18; index++) {
    const { vehicle, seat } = approach(f, index);
    f.pedestrian.setKey('KeyW', true);
    f.pedestrian.setKey('ShiftLeft', true);
    assert.equal(f.interaction.enter(), true, `Enter car ${index}`);
    assert.equal(f.interaction.state, f.pedestrian.state, 'One canonical player state');
    assert.equal(f.interaction.state.vehicleId, vehicle.vehicleId);
    assert.equal(f.interaction.state.seatId, 'driver');
    assert.equal(f.interaction.state.mode, 'driver');
    assert.equal(seat.occupiedBy, f.pedestrian.state.playerId);
    assert.equal(f.pedestrian.state.active, false);
    assert.equal(f.pedestrian.keys.size, 0);
    assert.equal(f.drive.state.active, true);
    assert.equal(f.controls.enabled, false);
    assertPose(f, vehicle, seat);
    const before = f.pedestrian.model.position.clone();
    f.pedestrian.update(.5);
    assert(f.pedestrian.model.position.equals(before), 'Seated walking input is suspended');
    assert.equal(f.interaction.enter(), false, 'Cannot occupy a second seat while seated');
    assert.equal(f.interaction.exit(), true, `Exit car ${index}`);
    const expectedDoor = f.registry.worldPosition(vehicle, seat);
    assert(Math.hypot(expectedDoor.x - f.pedestrian.model.position.x,
      expectedDoor.z - f.pedestrian.model.position.z) < 1e-10);
    assert.equal(f.pedestrian.model.position.y, -.12);
    assert.equal(f.pedestrian.collision(f.pedestrian.model.position.x, f.pedestrian.model.position.z), null);
    assert.equal(seat.occupiedBy, null);
    assert.equal(f.pedestrian.state.vehicleId, null);
    assert.equal(f.pedestrian.state.seatId, null);
    assert.equal(f.pedestrian.state.mode, 'onFoot');
    assert.equal(f.pedestrian.state.active, true);
    assert.equal(f.drive.state.active, false);
  }
});

test('front passenger and both rear seats use the approached door and never activate Golf driving', () => {
  const f = fixture();
  for (const index of [0, 2, 5, 16, 17]) for (const seatId of ['front-passenger', 'rear-left', 'rear-right']) {
    const { vehicle, seat } = approach(f, index, seatId);
    assert.equal(f.interaction.enter(), true);
    assert.equal(f.pedestrian.state.seatId, seatId);
    assert.equal(f.pedestrian.state.mode, 'passenger');
    assert.equal(f.drive.state.active, false);
    assertPose(f, vehicle, seat);
    assert.equal(f.interaction.exit(), true);
  }
});

test('occupied nearest door rejects entry even when another same-side seat is within reach', () => {
  const f = fixture(), vehicle = f.registry.vehicles[0];
  const seat = vehicle.seats.find(s => s.seatId === 'driver');
  assert.equal(f.registry.claim(vehicle.vehicleId, seat.seatId, 'another-player'), true);
  const point = f.registry.worldPosition(vehicle, seat); point.x -= .46;
  assert.equal(f.pedestrian.resumeAt(point), true);
  const nearbyRear = f.registry.worldPosition(vehicle, 'rear-left');
  assert(nearbyRear.distanceTo(f.pedestrian.model.position) < .95);
  assert.equal(f.interaction.nearest().seat.seatId, 'driver');
  assert(f.interaction.getStatus().prompt);
  assert.equal(f.interaction.enter(), false);
  assert.equal(seat.occupiedBy, 'another-player');
  assert.equal(vehicle.seats.find(s => s.seatId === 'rear-left').occupiedBy, null);
  assert.equal(f.pedestrian.state.active, true);
  assert.equal(f.pedestrian.state.vehicleId, null);
  assert(f.interaction.getStatus().message);
});

test('stale far-away targets and attempts to enter through the opposite body side are rejected', () => {
  const f = fixture(), { target, vehicle } = approach(f, 17);
  const opposite = { vehicle, seat: vehicle.seats.find(s => s.seatId === 'front-passenger') };
  assert.equal(f.interaction.enter(opposite), false);
  assert.equal(f.pedestrian.resumeAt(new THREE.Vector3(-18, -.12, -8)), true);
  assert.equal(f.interaction.nearest(), null);
  assert.equal(f.interaction.enter(target), false);
  assert.equal(f.pedestrian.state.vehicleId, null);
  assert(vehicle.seats.every(seat => seat.occupiedBy === null));
});

test('serialized actor identity and occupancy survive replacement of visual GLB children', () => {
  const f = fixture(); f.pedestrian.state.playerId = 'player-test';
  const { vehicle, seat } = approach(f, 2, 'front-passenger');
  assert.equal(f.interaction.enter(), true);
  const before = f.interaction.serialize();
  assert.equal(before.playerId, 'player-test');
  assert.equal(before.vehicleId, 'parked-golf-red');
  assert.notEqual(before.vehicleId, f.registry.vehicles[5].vehicleId);
  assert.equal(before.seatId, 'front-passenger');
  assert.equal(before.mode, 'passenger');
  assert.deepEqual(JSON.parse(JSON.stringify(before)), before);
  vehicle.car.clear(); vehicle.car.add(new THREE.Group());
  vehicle.car.userData.footprint = { halfLength: 2.3, halfWidth: 1.1 };
  f.interaction.update(1 / 60);
  assert.equal(f.interaction.serialize().vehicleId, before.vehicleId);
  assert.equal(vehicle.car.userData.vehicleId, before.vehicleId);
  assert.equal(seat.occupiedBy, 'player-test');
  assertPose(f, vehicle, seat);
  assert.equal(f.interaction.exit(), true);
  assert.equal(f.interaction.serialize().mode, 'onFoot');
  assert.equal(f.interaction.serialize().vehicleId, null);
});

test('seated pose follows live root translation and yaw and follows the Golf R reset', () => {
  const f = fixture(), { vehicle, seat } = approach(f, 5);
  assert.equal(f.interaction.enter(), true);
  vehicle.car.position.set(31, .14, 82); vehicle.car.rotation.y = -1.47;
  f.interaction.update(1 / 60); assertPose(f, vehicle, seat);
  assert.equal(f.pedestrian.state.active, false);
  assert.equal(f.pedestrian.keys.size, 0);
  f.drive.resetGolf(); f.interaction.update(1 / 60);
  assert(vehicle.car.position.equals(f.drive.golfHome));
  assert.equal(vehicle.car.rotation.y, f.drive.golfHeading);
  assert.equal(f.pedestrian.state.vehicleId, vehicle.vehicleId);
  assert.equal(f.pedestrian.state.seatId, seat.seatId);
  assert.equal(seat.occupiedBy, f.pedestrian.state.playerId);
  assert.equal(f.drive.state.active, true);
  assertPose(f, vehicle, seat);
});

test('blocked door exit preserves occupancy, actor/car pose and driving; no distant recovery teleport', () => {
  for (const index of [2, 5, 16, 17]) {
    const f = fixture(), { vehicle, seat } = approach(f, index);
    assert.equal(f.interaction.enter(), true);
    const actorBefore = f.pedestrian.model.position.clone();
    const carBefore = vehicle.car.position.clone(), carYaw = vehicle.car.rotation.y;
    f.pedestrian.collision = () => true;
    assert.equal(f.interaction.findExit(), null);
    assert.equal(f.interaction.exit(), false);
    assert(f.pedestrian.model.position.equals(actorBefore));
    assert(vehicle.car.position.equals(carBefore));
    assert.equal(vehicle.car.rotation.y, carYaw);
    assert.equal(f.pedestrian.state.vehicleId, vehicle.vehicleId);
    assert.equal(f.pedestrian.state.active, false);
    assert.equal(seat.occupiedBy, f.pedestrian.state.playerId);
    assert.equal(f.drive.state.active, true);
    assert(f.interaction.getStatus().message);
  }
});

test('moving Golf refuses physical exit through every existing control-mode wrapper', () => {
  const f = fixture(), { vehicle, seat } = approach(f, 5);
  assert.equal(f.interaction.enter(), true);
  f.drive.state.speed = safeExitSpeed + .01;
  const actorBefore = f.pedestrian.model.position.clone(), carBefore = vehicle.car.position.clone();
  for (const leave of [() => f.interaction.exit(), () => f.drive.setDriving(false),
    () => f.drive.setDriving(true), () => f.modes.walk(true), () => f.modes.walk(false),
    () => f.modes.overview()]) {
    assert.equal(leave(), false);
    assert.equal(f.drive.state.active, true);
    assert.equal(f.drive.state.speed, safeExitSpeed + .01);
    assert.equal(f.pedestrian.state.vehicleId, vehicle.vehicleId);
    assert.equal(seat.occupiedBy, f.pedestrian.state.playerId);
    assert(f.pedestrian.model.position.equals(actorBefore));
    assert(vehicle.car.position.equals(carBefore));
  }
  f.drive.state.speed = -safeExitSpeed - .01;
  assert.equal(f.interaction.exit(), false, 'Fast reversing also forbids exit');
});

test('failed repeated exit validation preserves the occupied Golf and its active controller', () => {
  const f = fixture(), { vehicle, seat } = approach(f, 5);
  assert.equal(f.interaction.enter(), true);
  vehicle.car.position.set(63, 0, 81); vehicle.car.rotation.y = -.63;
  f.drive.state.speed = .25; f.drive.setKey('KeyW', true);
  f.interaction.update(1 / 60);
  assert(f.interaction.findExit(), 'Initial door search has a free surface');
  const actorBefore = f.interaction.serialize();
  const driveBefore = { ...f.drive.state };
  const carBefore = vehicle.car.position.clone(), yawBefore = vehicle.car.rotation.y;
  const cameraBefore = f.camera.position.clone(), targetBefore = f.controls.target.clone();
  const resumeAt = f.pedestrian.resumeAt;
  let repeatedChecks = 0;
  f.pedestrian.resumeAt = point => {
    repeatedChecks++;
    assert.equal(f.pedestrian.collision(point.x, point.z), null);
    return false;
  };
  assert.equal(f.interaction.exit(), false);
  assert.equal(repeatedChecks, 1);
  assert.deepEqual(f.interaction.serialize(), actorBefore);
  assert.deepEqual(f.drive.state, driveBefore);
  assert.equal(f.drive.state.active, true);
  assert.equal(f.drive.keys.has('KeyW'), true);
  assert.equal(f.pedestrian.state.active, false);
  assert.equal(seat.occupiedBy, f.pedestrian.state.playerId);
  assert(vehicle.car.position.equals(carBefore));
  assert.equal(vehicle.car.rotation.y, yawBefore);
  assert(f.camera.position.equals(cameraBefore));
  assert(f.controls.target.equals(targetBefore));
  assert(f.interaction.getStatus().message);

  f.pedestrian.resumeAt = resumeAt;
  assert.equal(f.interaction.exit(), true, 'A later successful check allows the same door exit');
  assert.equal(f.drive.state.active, false);
  assert.equal(seat.occupiedBy, null);
});

test('legacy drive shortcut cannot occupy another player\'s Golf driver seat', () => {
  const f = fixture(), vehicle = f.registry.vehicles[5];
  assert.equal(f.registry.claim(vehicle.vehicleId, 'driver', 'another-player'), true);
  const actorBefore = f.interaction.serialize(), cameraBefore = f.camera.position.clone();
  assert.equal(f.interaction.canLegacyDrive(), false);
  assert.equal(f.drive.setDriving(true), false);
  assert.equal(f.drive.state.active, false);
  assert.equal(f.pedestrian.state.active, true);
  assert.deepEqual(f.interaction.serialize(), actorBefore);
  assert(f.camera.position.equals(cameraBefore));
  assert.equal(vehicle.seats.find(s => s.seatId === 'driver').occupiedBy, 'another-player');
  assert(f.interaction.getStatus().message);
  assert.equal(f.registry.release(vehicle.vehicleId, 'driver', 'another-player'), true);
  assert.equal(f.interaction.canLegacyDrive(), true);
  assert.equal(f.drive.setDriving(true), true);
  assert.equal(f.drive.state.active, true);
  assert.equal(f.pedestrian.state.active, false);
});

test('traffic obstruction signal retains physically parked Golf and clears after explicit home reset', () => {
  const f = fixture();
  assert.equal(f.interaction.golfBlocksTraffic(), false, 'Idle home Golf preserves existing traffic behaviour');
  f.drive.golf.position.y = -.33;
  assert.equal(f.interaction.golfBlocksTraffic(), false, 'Ground height does not count as parking displacement');
  f.drive.resetGolf();
  const { vehicle } = approach(f, 5);
  assert.equal(f.interaction.enter(), true);
  assert.equal(f.interaction.golfBlocksTraffic(), true, 'An active home driver participates in yielding');
  vehicle.car.position.set(63, 0, 81); vehicle.car.rotation.y = -.63;
  f.interaction.update(1 / 60);
  assert.equal(f.interaction.exit(), true);
  assert.equal(f.drive.state.active, false);
  assert.equal(f.interaction.golfBlocksTraffic(), true, 'Unoccupied relocated Golf still blocks traffic');
  f.drive.resetGolf();
  assert.equal(f.interaction.golfBlocksTraffic(), false);
  f.drive.golf.position.x += .05;
  assert.equal(f.interaction.golfBlocksTraffic(), false, 'Small resting pose tolerance is ignored');
  f.drive.golf.position.x += .06;
  assert.equal(f.interaction.golfBlocksTraffic(), true, 'Displacement beyond the tolerance counts');
});

test('existing automatic drifters yield to the obstruction signal after physical Golf exit', () => {
  const f = fixture(), { vehicle } = approach(f, 5);
  assert.equal(f.interaction.enter(), true);
  const predicted = driftPose(.08 + .3, 0);
  vehicle.car.position.set(predicted.x, 0, predicted.z); vehicle.car.rotation.y = predicted.angle;
  f.interaction.update(1 / 60);
  assert.equal(f.interaction.exit(), true);
  assert.equal(f.drive.state.active, false);
  const scene = new THREE.Scene(), { mat, stopSharingStaticMaterials } = createMaterialSystem();
  stopSharingStaticMaterials();
  const drift = createDriftSystem(scene, createCarFactory(scene, mat), { makeSmokeTexture: () => new THREE.Texture() });
  drift.update(.08, { driving: f.interaction.golfBlocksTraffic(), golfPosition: vehicle.car.position });
  assert.equal(drift.driftWaiting, true);
  assert.equal(drift.driftTime, 0, 'Drifters pause before hitting an unoccupied relocated Golf');
  f.drive.resetGolf();
  drift.update(.08, { driving: f.interaction.golfBlocksTraffic(), golfPosition: vehicle.car.position });
  assert.equal(drift.driftWaiting, false);
  assert(drift.driftTime > 0, 'Original drift resumes after the explicit home reset');
});

test('driving after door seating and safe Golf exit retain the stopped pose and resume walking', () => {
  const f = fixture(), { vehicle, seat } = approach(f, 5);
  const home = f.drive.golfHome.clone();
  assert.equal(f.interaction.enter(), true);
  f.drive.setKey('KeyW', true);
  for (let i = 0; i < 60; i++) f.drive.updateDriving(1 / 60);
  assert(vehicle.car.position.distanceTo(home) > 2);
  assert(f.drive.state.speed > safeExitSpeed);
  f.drive.setKey('KeyW', false); f.drive.setKey('Space', true);
  for (let i = 0; i < 240 && f.drive.state.speed > safeExitSpeed; i++) f.drive.updateDriving(1 / 60);
  assert(f.drive.state.speed <= safeExitSpeed);
  const stopped = vehicle.car.position.clone(), yaw = vehicle.car.rotation.y;
  assert.equal(f.drive.setDriving(false), true, 'Legacy UI exit delegates to physical seat exit');
  assert(vehicle.car.position.equals(stopped));
  assert.equal(vehicle.car.rotation.y, yaw);
  assert.equal(f.drive.state.active, false);
  assert.equal(f.drive.keys.size, 0);
  assert.equal(f.pedestrian.state.active, true);
  assert.equal(f.pedestrian.state.mode, 'onFoot');
  assert.equal(seat.occupiedBy, null);
  const walkStart = f.pedestrian.model.position.clone();
  f.pedestrian.state.cameraYaw = 0; f.pedestrian.setKey('KeyW', true);
  f.pedestrian.update(.25); assert(f.pedestrian.model.position.distanceTo(walkStart) > .4);
  assert(vehicle.car.position.equals(stopped));

  f.drive.setDriving(true);
  assert.equal(f.pedestrian.state.active, false);
  f.drive.resetGolf();
  assert(vehicle.car.position.equals(home), 'R retains its explicit home reset');
  vehicle.car.position.set(55, 0, 85);
  f.drive.setDriving(false);
  assert(vehicle.car.position.equals(home), 'Unoccupied legacy drive mode still resets on exit');
});

test('stationary seated camera cycling and overview exit restore the original view', () => {
  const f = fixture(), { vehicle, seat } = approach(f, 16, 'front-passenger');
  assert.equal(f.interaction.enter(), true);
  const firstView = f.camera.position.clone();
  f.interaction.cycleCamera();
  assert(f.camera.position.distanceTo(firstView) > 1);
  assert.equal(f.controls.enabled, false);
  assertPose(f, vehicle, seat);
  assert.equal(f.modes.overview(), true);
  assert.equal(f.pedestrian.state.active, false);
  assert.equal(f.pedestrian.state.vehicleId, null);
  assert.equal(seat.occupiedBy, null);
  assert.equal(f.drive.state.active, false);
  assert.equal(f.controls.enabled, true);
  assert.deepEqual(f.camera.position.toArray(), [-115, 150, 190]);
  assert.deepEqual(f.controls.target.toArray(), [-4, 12, -25]);
});

// Stage 7C: drive through the same proximity/occupancy path as the UI, never by assigning poses.
test('all 18 drivers accelerate, steer, brake, exit and reenter without moving previous cars',()=>{
  const f=fixture(), saved=new Map();
  for(let index=0;index<18;index++) {
    const {vehicle,seat}=approach(f,index), before=vehicle.car.position.clone(), yaw=vehicle.car.rotation.y;
    assert(f.interaction.enter());assert.equal(f.drive.golf,vehicle.car);
    f.drive.setKey('KeyW',true);
    for(let i=0;i<30;i++)f.drive.updateDriving(1/60);
    f.drive.setKey('KeyW',false);f.drive.setKey('KeyA',true);
    for(let i=0;i<10;i++)f.drive.updateDriving(1/60);
    f.drive.setKey('KeyA',false);f.interaction.update(1/60);
    assert(vehicle.car.position.distanceTo(before)>.4);
    assert(Math.abs(vehicle.car.rotation.y-yaw)>.005);assertPose(f,vehicle,seat);
    assert.equal(f.interaction.exit(),false,'Moving exit refused');
    f.drive.setKey('Space',true);
    for(let i=0;i<120;i++)f.drive.updateDriving(1/60);
    f.drive.setKey('Space',false);
    const stopped={position:vehicle.car.position.clone(),yaw:vehicle.car.rotation.y};
    assert(f.interaction.exit());assert(vehicle.car.position.equals(stopped.position));
    assert.equal(vehicle.car.rotation.y,stopped.yaw);
    for(const [car,pose] of saved){assert(car.position.equals(pose.position));assert.equal(car.rotation.y,pose.yaw);}
    saved.set(vehicle.car,stopped);
    approach(f,index);assert(f.interaction.enter());assert(vehicle.car.position.equals(stopped.position));
    assert(f.interaction.exit());
  }
});
test('every passenger seat rejects driving input after switching vehicle',()=>{
  const f=fixture();
  for(let index=0;index<18;index++)for(const seatId of ['front-passenger','rear-left','rear-right']) {
    const {vehicle}=approach(f,index,seatId);const before=vehicle.car.position.clone();
    assert(f.interaction.enter());f.drive.setKey('KeyW',true);f.drive.updateDriving(.5);
    assert.equal(f.drive.state.active,false);assert(vehicle.car.position.equals(before));assert(f.interaction.exit());
  }
});

test('explicit reset targets each occupied vehicle and preserves its driver seat',()=>{
  const f=fixture();
  for(let index=0;index<18;index++) {
    const {vehicle,seat}=approach(f,index), home=vehicle.car.position.clone(), yaw=vehicle.car.rotation.y;
    assert(f.interaction.enter());f.drive.setKey('KeyW',true);
    for(let i=0;i<30;i++)f.drive.updateDriving(1/60);
    assert(vehicle.car.position.distanceTo(home)>.4);
    f.drive.resetGolf();f.interaction.update(1/60);
    assert(vehicle.car.position.equals(home));assert.equal(vehicle.car.rotation.y,yaw);
    assert.equal(f.pedestrian.state.vehicleId,vehicle.vehicleId);
    assert.equal(seat.occupiedBy,f.pedestrian.state.playerId);assertPose(f,vehicle,seat);
    assert(f.interaction.exit());
  }
});
