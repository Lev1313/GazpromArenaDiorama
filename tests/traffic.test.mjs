import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem, createBaseMaterials } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createTrafficSystem } from '../src/vehicles/traffic.js';
import { createZsd } from '../src/world/zsd.js';
import { createParkingMeet } from '../src/world/parkingMeet.js';
import { driveArea, parkingLights } from '../src/world/siteLayout.js';
import { parkingOutline } from '../src/world/terrain.js';
import { carOverlap, circleOverlap } from '../src/vehicles/golfDrive.js';

function makeSetup(realZsd = false) {
  const scene = new THREE.Scene();
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  const materials = createBaseMaterials(mat);
  stopSharingStaticMaterials();
  const carFactory = createCarFactory(scene, mat);
  const highway = realZsd ? createZsd(scene, mat, materials) : (() => {
    const highwayCurve = new THREE.CatmullRomCurve3(
      [[-21, 16.8, 77], [-27, 16.8, 0], [26, 16.8, -120]].map(
        p => new THREE.Vector3(...p),
      ),
      false, 'centripetal',
    );
    return {
      highwayCurve,
      highwayPoint(t, lane = 0) {
        const p = highwayCurve.getPointAt(t);
        const d = highwayCurve.getTangentAt(t);
        return p.add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(lane - 5.2));
      },
    };
  })();
  const markings = mat(0x93a6ac);
  const staticObjects = scene.children.length;
  const traffic = createTrafficSystem(scene, carFactory, highway, markings);
  return { scene, traffic, highway, markings, staticObjects };
}

test('14 ZSD cars keep original states and 3 guests start beyond the east edge', () => {
  const { scene, traffic, markings, staticObjects } = makeSetup();
  assert.equal(traffic.highCars.length, 14);
  assert.equal(traffic.visitors.length, 3);
  assert.equal(scene.children.length - staticObjects, 23);
  assert.equal(traffic.parkedVisitorCount, 0);

  for (let i = 0; i < 14; i++) {
    const c = traffic.highCars[i];
    assert.equal(c.direction, i < 7 ? 1 : -1);
    assert.equal(c.t, (i % 7) / 7);
    assert.equal(c.lane, (i < 7 ? 1 : -1) * (1.5 + (i % 4) * 2.2));
  }

  for (let i = 0; i < 3; i++) {
    const c = traffic.visitors[i];
    assert.equal(c.state, 'arrive');
    assert.equal(c.delay, i * 12);
    assert.equal(c.parkTime, 22 + i * 6);
    assert.equal(c.o.visible, i === 0);
    assert.deepEqual(c.arrive.points[0].toArray(), [95, 0, 30.5]);
    assert.deepEqual(c.arrive.points.at(-1).toArray(), [-17 + 9 * i, 0, -35]);
  }

  const lines = scene.children.filter(o => o.isMesh &&
    o.material === markings &&
    o.geometry.type === 'BoxGeometry' &&
    o.geometry.parameters.width === .1);
  assert.equal(lines.length, 6);
});

test('ZSD cars move at original .025/s pace in both directions and maintain lanes', () => {
  const { traffic, highway } = makeSetup();
  const ahead = traffic.highCars[0];
  const reverse = traffic.highCars[7];
  traffic.update(.08);
  assert.ok(Math.abs(ahead.t - .002) < 1e-12);
  assert.ok(Math.abs(reverse.t - .002) < 1e-12);
  for (const c of [ahead, reverse]) {
    const t = c.direction === 1 ? c.t : 1 - c.t;
    const expected = highway.highwayPoint(t, c.lane);
    assert.ok(c.o.position.distanceTo(expected) < 1e-8);
    const tangent = highway.highwayCurve.getTangentAt(t);
    const angle = -Math.atan2(tangent.z, tangent.x)
      + (c.direction === 1 ? 0 : Math.PI);
    assert.ok(Math.abs(c.o.rotation.y - angle) < 1e-10);
  }
});

test('guest arrives, parks for the original dwell time, leaves, then waits to return', () => {
  const { traffic } = makeSetup();
  const guest = traffic.visitors[0];
  for (let i = 0; i < 400 && guest.state !== 'park'; i++) traffic.update(.25);
  assert.equal(guest.state, 'park');
  assert.equal(traffic.parkedVisitorCount >= 1, true);
  assert.equal(guest.t, 1);
  assert.ok(guest.o.visible);
  assert.ok(guest.o.position.distanceTo(guest.arrive.getPointAt(1)) < 1e-8);

  const waitBefore = guest.wait;
  traffic.update(.1);
  assert.equal(guest.state, 'park');
  assert.ok(guest.wait > waitBefore);

  // No early departure: shorter than 22 seconds from the park transition.
  if (guest.wait < guest.parkTime) {
    const margin = guest.parkTime - guest.wait;
    traffic.update(Math.max(0, margin - .2));
    assert.equal(guest.state, 'park');
  }
  traffic.update(.3);
  assert.equal(guest.state, 'reverse');
  for (let i = 0; i < 80 && guest.state === 'reverse'; i++) traffic.update(.25);
  assert.equal(guest.state, 'leave');
  assert.equal(guest.t, 0);

  for (let i = 0; i < 400 && guest.state === 'leave'; i++) traffic.update(.25);
  assert.equal(guest.state, 'arrive');
  assert.equal(guest.delay, 14);
  assert.equal(guest.t, 0);
  assert.equal(guest.o.visible, false);
});

test('visitors respect initial delays and yield to an active Golf', () => {
  const { traffic } = makeSetup();
  const visitor = traffic.visitors[0];
  const nextTime = visitor.t + .06 * 3 / visitor.arrive.getLength();
  const nextPos = visitor.arrive.getPointAt(nextTime);
  traffic.update(.06, { driving: true, golfPosition: nextPos });
  assert.equal(visitor.t, 0);
  traffic.update(.06);
  assert.ok(visitor.t > 0);

  const delayed = traffic.visitors[1];
  assert.equal(delayed.o.visible, false);
  traffic.update(11.88); // visitor 1 delay reaches zero
  assert.equal(delayed.o.visible, false);
  traffic.update(.06);
  assert.equal(delayed.o.visible, true);
  assert.ok(delayed.t > 0);
});

test('visitor/road traffic integrates with the existing ZSD geometry without new objects per frame', () => {
  const { scene, traffic, highway, staticObjects } = makeSetup(true);
  assert.equal(highway.highwayCurve.points.length, 7);
  const cars = traffic.highCars.map(c => c.o).concat(traffic.visitors.map(c => c.o));
  assert.ok(cars.every(o => o.parent === scene));
  const count = scene.children.length;
  const meshes = scene.children.filter(o => o.isGroup).length;
  assert.equal(meshes, 17);
  assert.equal(count - staticObjects, 23);
  assert.ok(traffic.highCars[0].o.position.y > 16);

  for (let i = 0; i < 100; i++) traffic.update(.06);
  assert.equal(scene.children.length, count);
  assert.equal(traffic.highCars.length, 14);
  assert.equal(traffic.visitors.length, 3);
});

test('complete guest routes keep the car footprint on asphalt and clear parked cars, people and lamps', () => {
  const { traffic } = makeSetup();
  const scene = new THREE.Scene(), { mat } = createMaterialSystem();
  const { parked, people } = createParkingMeet(scene, mat, createBaseMaterials(mat), createCarFactory(scene, mat), {
    makeLabel() { return new THREE.Sprite(); },
  });
  const area = driveArea(parkingOutline);
  for (const guest of traffic.visitors) for (const name of ['arrive','reverse','leave']) {
    const curve = guest[name];
    for (let i=0;i<=2000;i++) {
      const p=curve.getPointAt(i/2000), d=curve.getTangentAt(i/2000);
      const yaw=-Math.atan2(d.z,d.x), at=`${name} ${i}: ${p.x},${p.z}`;
      for (const a of [-1.96,1.96]) for (const b of [-1.04,1.04]) {
        const x=p.x+a*d.x-b*d.z, z=p.z+a*d.z+b*d.x;
        assert.ok(x>89 || area(x,z), 'Off asphalt '+at);
      }
      assert.ok(!parked.some(o=>carOverlap(p,yaw,o)), 'Parked car '+at);
      assert.ok(!people.some(o=>circleOverlap(p,yaw,o.position.x,o.position.z,.4)), 'Spectator '+at);
      assert.ok(!parkingLights.some(([x,z])=>circleOverlap(p,yaw,x,z,.35)), 'Lamp '+at);
    }
    if (name==='reverse') {
      assert.ok(curve.getPointAt(1).distanceTo(guest.leave.getPointAt(0))<1e-8);
      assert.ok(curve.getTangentAt(1).dot(guest.leave.getTangentAt(0))<-.999);
    }
  }
});

test('all guests complete repeated visits without collisions or visible teleports', () => {
  const { traffic } = makeSetup(), completed=[0,0,0];
  for (let frame=0;frame<60*600;frame++) {
    const before=traffic.visitors.map(c=>({p:c.o.position.clone(),visible:c.o.visible,state:c.state}));
    traffic.update(1/60);
    traffic.visitors.forEach((c,i)=>{
      if (before[i].state==='leave' && c.state==='arrive') completed[i]++;
      if (before[i].visible && c.o.visible) assert.ok(before[i].p.distanceTo(c.o.position)<.07, 'Visible teleport');
      if(c.o.visible) for(const other of traffic.visitors.slice(i+1)) if(other.o.visible)
        assert.ok(!carOverlap(c.o.position,c.o.rotation.y,other.o), 'Visitors overlap');
    });
  }
  assert.ok(completed.every(n=>n>=3), `Visitors stuck: completed ${completed}`);
});
test('visitors yield to a relocated SUV and resume when its live footprint clears',()=>{
  const {traffic}=makeSetup(), visitor=traffic.visitors[0], car=new THREE.Group();
  car.userData.footprint={halfLength:2.56,halfWidth:1.132};
  car.position.copy(visitor.arrive.getPointAt(.001));
  traffic.update(1/60,{obstacles:[car]});assert.equal(visitor.t,0);
  car.position.set(-100,0,-100);
  traffic.update(1/60,{obstacles:[car]});assert(visitor.t>0);
});
