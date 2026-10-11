import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem, createBaseMaterials } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createParkingMeet } from '../src/world/parkingMeet.js';

function setup() {
  const scene = new THREE.Scene();
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  const materials = createBaseMaterials(mat);
  // The original HTML disables material sharing just after static batching.
  stopSharingStaticMaterials();
  const cars = createCarFactory(scene, mat);
  const result = createParkingMeet(scene, mat, materials, cars, {
    makeLabel(target, text, x, z) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      sprite.position.set(x, 5, z);
      sprite.scale.set(24, 3.75, 1);
      target.add(sprite);
      return sprite;
    },
  });
  return { scene, materials, cars, ...result };
}

test('original parking has exactly 18 cars and 32 spectators', () => {
  const { scene, parked, people, staticCount } = setup();
  assert.equal(staticCount, 18);
  assert.equal(parked.length, 18);
  assert.equal(people.length, 32);
  assert.equal(scene.children.filter(o => o.isGroup).length, 50);
  assert.ok(parked.every(o => o.parent === scene));
  assert.ok(people.every(o => o.parent === scene));
  // 18 car groups + 32 people groups + 28 painted bay marks +
  // 6 picnic table boxes + 14 boundary bollards + 1 Golf sprite.
  assert.equal(scene.children.length, 99);
});

test('parked-car rows and visitor-free slots retain original coordinates', () => {
  const { parked } = setup();
  for (let row = 0; row < 2; row++) {
    const x = row === 0 ? -22.4 : 6.1;
    for (let j = 0; j < 7; j++) {
      const car = parked[row * 7 + j];
      assert.deepEqual(car.position.toArray(), [x, 0, -24 + j * 8]);
      assert.equal(car.rotation.y, row === 0 ? 0 : Math.PI);
      assert.equal(car.userData.frontWheels.length, 2);
    }
  }
  for (let j = 0; j < 4; j++) {
    assert.deepEqual(parked[14 + j].position.toArray(), [-19 + 7 * j, 0, 33]);
    assert.equal(parked[14 + j].rotation.y, Math.PI / 2);
  }
  assert.equal(parked[14].children.length, 18, 'first arrival-side car is sporty');
  assert.equal(parked[15].children.length, 14);
});

test('car factory retains original dimensions, wheels and independent paint', () => {
  const scene = new THREE.Scene();
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  stopSharingStaticMaterials();
  const { car } = createCarFactory(scene, mat);
  const left = car(0xaabbcc, { hatch: true });
  const right = car(0xaabbcc);
  assert.equal(left.children[0].geometry.parameters.width, 3.7);
  assert.equal(left.children[0].geometry.parameters.height, 0.62);
  assert.equal(left.children[0].geometry.parameters.depth, 1.7);
  assert.equal(left.children[2].geometry.parameters.width, 2.1);
  assert.equal(right.children[2].geometry.parameters.width, 1.75);
  assert.equal(left.userData.frontWheels.length, 2);
  assert.equal(right.userData.frontWheels.length, 2);
  assert.notStrictEqual(left.children[0].material, right.children[0].material);
  left.children[0].material.color.setHex(0x123456);
  assert.equal(right.children[0].material.color.getHex(), 0xaabbcc);
  assert.ok(left.children[0].castShadow);
});

test('Golf VI keeps its silver body, label and original parking slot', () => {
  const { parked, golf, golfLabel } = setup();
  assert.strictEqual(golf, parked[5]);
  assert.deepEqual(golf.position.toArray(), [-22.4, 0, 16]);
  assert.equal(golf.children[0].material.color.getHex(), 0xbdc8d1);
  assert.deepEqual(golfLabel.position.toArray(), [-23, 2.5, 17]);
  assert.deepEqual(golfLabel.scale.toArray(), [6, 1, 1]);
});

test('people, parking lines and boundary bollards preserve original forms', () => {
  const { scene, people, markings } = setup();
  assert.deepEqual(people[0].position.toArray(), [-25.2, 0, -25.4]);
  assert.deepEqual(people[31].position.toArray(), [2, 0, 37]);
  assert.equal(people[0].children.length, 7);
  assert.equal(people[1].children.length, 6);

  const lines = scene.children.filter(o => o.isMesh
    && o.material === markings
    && o.geometry.type === 'BoxGeometry'
    && o.geometry.parameters.width === 5.1);
  assert.equal(lines.length, 28);

  const bollards = scene.children.filter(o => o.isMesh
    && o.geometry.type === 'CylinderGeometry'
    && o.geometry.parameters.height === 0.65
    && o.material.color.getHex() === 0xe6974e);
  assert.equal(bollards.length, 14);
});
