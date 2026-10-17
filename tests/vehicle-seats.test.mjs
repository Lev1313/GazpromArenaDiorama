import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createVehicleRegistry } from '../src/vehicles/vehicleSeats.js';

const parkedCars = () => Array.from({ length: 19 }, () => new Group());

test('all 19 parked vehicles have deterministic distinct identities; all support driving', () => {
  const parked = parkedCars(), registry = createVehicleRegistry(parked);
  assert.equal(registry.vehicles.length, 19);
  const ids = registry.vehicles.map(vehicle => vehicle.vehicleId);
  assert.equal(new Set(ids).size, 19);
  assert.equal(ids[2], 'parked-golf-red');
  assert.equal(ids[5], 'parked-golf-player');
  assert.equal(ids[16], 'parked-mercedes-gl');
  assert.equal(ids[17], 'parked-lexus-rx');
  assert.equal(ids[18], 'parked-mercedes-gla-x156');
  assert.deepEqual(ids.slice(0,18), Array.from({length:18},(_,i)=>({2:'parked-golf-red',5:'parked-golf-player',16:'parked-mercedes-gl',17:'parked-lexus-rx'}[i]??'parked-'+String(i).padStart(2,'0'))));
  assert.deepEqual(registry.vehicles.filter(vehicle => vehicle.canDrive).map(vehicle => vehicle.index), Array.from({length:19},(_,i)=>i));
  assert.deepEqual(createVehicleRegistry(parkedCars()).vehicles.map(vehicle => vehicle.vehicleId), ids);
  for (const vehicle of registry.vehicles) {
    assert.equal(vehicle.car.userData.vehicleId, vehicle.vehicleId);
    assert.equal(registry.get(vehicle.vehicleId), vehicle);
    assert.equal(vehicle.seats.length, 4);
    assert.equal(new Set(vehicle.seats.map(seat => seat.seatId)).size, 4);
  }
});

test('replacing GLB visual children cannot change vehicle identity or seat occupancy', () => {
  const parked = parkedCars(), registry = createVehicleRegistry(parked);
  const vehicle = registry.vehicles[2], seats = vehicle.seats;
  assert(registry.claim(vehicle.vehicleId, 'driver', 'player-local'));
  parked[2].clear(); parked[2].add(new Group());
  registry.refresh(vehicle);
  assert.equal(vehicle.vehicleId, 'parked-golf-red');
  assert.equal(vehicle.car.userData.vehicleId, 'parked-golf-red');
  assert.equal(vehicle.seats, seats);
  assert.equal(seats[0].occupiedBy, 'player-local');
});

test('seat and entry positions follow live dimensions and preserve their vector references', () => {
  const registry = createVehicleRegistry(parkedCars());
  for (const [index, halfLength, halfWidth] of [[2, 2.1375, 1.0395], [16, 2.56, 1.132], [17, 2.4327, 1.0763]]) {
    const vehicle = registry.vehicles[index], seat = vehicle.seats[0];
    const position = seat.localPosition, entry = seat.entryPoint;
    registry.claim(vehicle.vehicleId, seat.seatId, 'player-local');
    vehicle.car.userData.footprint = { halfLength, halfWidth };
    assert.equal(registry.refresh(vehicle.vehicleId), vehicle);
    assert.equal(seat.localPosition, position); assert.equal(seat.entryPoint, entry);
    assert(Math.abs(seat.entryPoint.z + halfWidth + .65) < 1e-12);
    assert(Math.abs(seat.localPosition.x + .25 * halfLength / 1.96) < 1e-12);
    assert.equal(seat.occupiedBy, 'player-local');
  }
});

test('driver and rear-left doors use -Z; front and rear passenger right doors use +Z', () => {
  const registry = createVehicleRegistry(parkedCars());
  for (const vehicle of registry.vehicles) for (const seat of vehicle.seats) {
    assert.equal(seat.role, seat.seatId === 'driver' ? 'driver' : 'passenger');
    assert.equal(Math.sign(seat.entryPoint.z), ['driver', 'rear-left'].includes(seat.seatId) ? -1 : 1);
    assert.equal(Math.sign(seat.localPosition.z), seat.side);
    assert.equal(Math.sign(seat.localPosition.x), seat.front && ![2, 16, 17, 18].includes(vehicle.index) ? 1 : -1);
    assert(Math.abs(seat.entryPoint.z) - Math.abs(seat.localPosition.z) > .9);
  }
});

test('calibrated cabin heights and row positions are retained across footprint refresh', () => {
  const registry = createVehicleRegistry(parkedCars());
  for (const [index, height] of [[0, .05], [2, -.28], [5, .05], [16, .15], [17, -.02]]) {
    const vehicle = registry.vehicles[index];
    vehicle.car.userData.footprint = { halfLength: 3, halfWidth: 1.4 };
    registry.refresh(vehicle);
    for (const seat of vehicle.seats) {
      assert.equal(seat.localPosition.y, height);
      const glb = [2, 16, 17, 18].includes(index);
      const expectedX = (seat.front ? glb ? -.25 : .3 : glb ? -.85 : -.72) * 3 / 1.96;
      assert.equal(seat.localPosition.x, expectedX);
      assert.equal(seat.entryPoint.x, expectedX);
      assert.equal(seat.localPosition.z, seat.side * 1.4 * .34);
      assert.equal(seat.entryPoint.z, seat.side * (1.4 + .65));
    }
  }
});

test('world positions use car.localToWorld including parent transform without a render update', () => {
  const parked = parkedCars(), registry = createVehicleRegistry(parked), parent = new Group();
  parent.position.set(10, 3, -7); parent.rotation.y = .75; parent.scale.set(1.2, 1, 1.2);
  const car = parked[17]; parent.add(car); car.position.set(2, .2, 4); car.rotation.y = -1.1;
  const vehicle = registry.vehicles[17], seat = vehicle.seats[1];
  const actual = registry.worldPosition(vehicle, seat, 'localPosition');
  const expected = seat.localPosition.clone().applyAxisAngle(new Vector3(0, 1, 0), car.rotation.y)
    .add(car.position).multiply(parent.scale).applyAxisAngle(new Vector3(0, 1, 0), parent.rotation.y).add(parent.position);
  assert(actual.distanceTo(expected) < 1e-12);
  const entry = registry.worldPosition(vehicle.vehicleId, seat.seatId);
  assert(entry.distanceTo(car.localToWorld(seat.entryPoint.clone())) < 1e-12);
  assert(actual.distanceTo(car.localToWorld(seat.localPosition.clone())) < 1e-12);
  assert.notEqual(actual, seat.localPosition);
});

test('occupied seats cannot be claimed twice, even by their owner; release checks ownership', () => {
  const registry = createVehicleRegistry(parkedCars()), vehicleId = registry.vehicles[5].vehicleId;
  assert(registry.claim(vehicleId, 'driver', 'player-a'));
  assert(!registry.claim(vehicleId, 'driver', 'player-a'));
  assert(!registry.claim(vehicleId, 'driver', 'player-b'));
  assert(!registry.release(vehicleId, 'driver', 'player-b'));
  assert(registry.claim(vehicleId, 'front-passenger', 'player-b'));
  assert(registry.release(vehicleId, 'driver', 'player-a'));
  assert(registry.claim(vehicleId, 'driver', 'player-b'));
  assert(!registry.claim('missing', 'driver', 'player-a'));
  assert(!registry.claim(vehicleId, 'missing', 'player-a'));
  assert(!registry.claim(vehicleId, 'rear-left', ''));
  assert(!registry.release(vehicleId, 'rear-left', ''));
});

test('occupancy serialization is detached plain data ready for later synchronization', () => {
  const registry = createVehicleRegistry(parkedCars()), vehicleId = registry.vehicles[17].vehicleId;
  registry.claim(vehicleId, 'rear-left', 'player-local');
  const snapshot = registry.serialize();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.deepEqual(snapshot[17], {
    vehicleId,
    seats: [
      { seatId: 'driver', role: 'driver', occupiedBy: null },
      { seatId: 'front-passenger', role: 'passenger', occupiedBy: null },
      { seatId: 'rear-left', role: 'passenger', occupiedBy: 'player-local' },
      { seatId: 'rear-right', role: 'passenger', occupiedBy: null },
    ],
  });
  snapshot[17].seats[2].occupiedBy = null;
  assert.equal(registry.get(vehicleId).seats[2].occupiedBy, 'player-local');
});

test('duplicate pre-existing vehicle IDs fail instead of silently sharing occupancy', () => {
  const parked = parkedCars();
  parked[0].userData.vehicleId = parked[1].userData.vehicleId = 'duplicate';
  assert.throws(() => createVehicleRegistry(parked), /Duplicate vehicleId/);
});
