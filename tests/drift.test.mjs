import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createDriftSystem, driftPose } from '../src/vehicles/drift.js';

function makeDrift() {
  const scene = new THREE.Scene();
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  stopSharingStaticMaterials();
  const factory = createCarFactory(scene, mat);
  const system = createDriftSystem(scene, factory, {
    makeSmokeTexture: () => new THREE.Texture(),
  });
  return { scene, system };
}

test('driftPose preserves original ellipse, timing, countersteer and phases', () => {
  const p = driftPose(0, 0);
  assert.ok(Math.abs(p.x - (-8.1 + 7.4)) < 1e-12);
  assert.equal(p.z, 0);
  assert.ok(Math.abs(p.angle - (-Math.atan2(18.5, .75) + .43)) < 1e-12);

  const q = driftPose(0, 1.1);
  const a = -1.1, r = 7.4 + .25 * Math.sin(a * 3);
  assert.ok(Math.abs(q.x - (-8.1 + r * Math.cos(a))) < 1e-12);
  assert.ok(Math.abs(q.z - 18.5 * Math.sin(a)) < 1e-12);
  assert.ok(Number.isFinite(q.angle));
});

test('two sporting drifters, smoke sprites and three existing tire rings', () => {
  const { scene, system } = makeDrift();
  assert.equal(system.drifters.length, 2);
  assert.deepEqual(system.drifters.map(c => c.phase), [0, 1.1]);
  assert.equal(system.smokePool.length, 90);
  assert.equal(system.prelaidTracks.length, 3);
  assert.equal(scene.children.length, 96);
  assert.equal(scene.children.filter(o => o.isGroup).length, 2);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  assert.ok(system.smokePool.every(p => p.o.material.depthWrite === false));
  assert.ok(system.smokePool.every(p => p.o.material.transparent));

  const first = driftPose(0, 0);
  assert.deepEqual(
    system.drifters[0].o.position.toArray(),
    [first.x, 0, first.z],
  );
  assert.equal(system.drifters[0].o.rotation.y, first.angle);
  assert.equal(system.skidCapacity, 4000);
  assert.equal(system.skidPositions.length, 24000);
  assert.equal(system.skidGeometry.drawRange.count, 0);
  assert.equal(system.skidLines.frustumCulled, false);
  assert.equal(system.prelaidTracks[0].geometry.attributes.position.count, 129);
});

test('drifting creates bounded skid segments and smoke without growing mesh counts', () => {
  const { scene, system } = makeDrift();
  system.update(.08);
  assert.equal(system.skidCount, 0); // Legacy first update stores the rear-wheel locations.
  assert.equal(system.smokePool.filter(p => p.o.visible).length, 4);
  assert.equal(system.drifters[0].o.userData.frontWheels.length, 2);
  assert.ok(system.drifters[0].o.userData.frontWheels.every(w => w.rotation.y === -.4));

  system.update(.08);
  assert.equal(system.skidCount, 4); // Two marks per car.
  assert.equal(system.skidGeometry.drawRange.count, 8);
  assert.equal(system.smokePool.filter(p => p.o.visible).length, 8);

  const before = scene.children.length;
  for (let i = 0; i < 110; i++) system.update(.08);
  assert.equal(scene.children.length, before);
  assert.ok(system.skidCount <= system.skidCapacity);
  assert.ok(system.smokePool.filter(p => p.o.visible).length <= 90);
  assert.equal(system.smokePool.length, 90);
});

test('disabling smoke hides particles without stopping vehicle movement or skids', () => {
  const { system } = makeDrift();
  system.update(.08);
  assert.ok(system.smokePool.some(p => p.o.visible));
  system.setSmokeEnabled(false);
  assert.equal(system.smokeEnabled, false);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  const t = system.driftTime;
  system.update(.08);
  assert.ok(system.driftTime > t);
  assert.equal(system.skidCount, 4);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  system.setSmokeEnabled(true);
  assert.equal(system.smokeEnabled, true);
  system.update(.08);
  assert.ok(system.smokePool.some(p => p.o.visible));
});

test('drifters yield to the future Golf drive mode, while crowds subtly sway', () => {
  const { system } = makeDrift();
  const predicted = driftPose(.08 + .3, 0);
  const golfPosition = new THREE.Vector3(predicted.x, 0, predicted.z);
  const crowd = [new THREE.Group(), new THREE.Group()];
  system.update(.08, { driving: true, golfPosition, people: crowd });
  assert.equal(system.driftWaiting, true);
  assert.equal(system.driftTime, 0);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  assert.ok(Math.abs(crowd[0].rotation.z - Math.sin(.08 * 1.4) * .015) < 1e-12);
  assert.ok(Math.abs(crowd[1].rotation.z - Math.sin(.08 * 1.4 + 1) * .015) < 1e-12);

  system.update(.08, { people: crowd });
  assert.equal(system.driftWaiting, false);
  assert.ok(system.driftTime > 0);
  assert.ok(system.smokePool.some(p => p.o.visible));
});
