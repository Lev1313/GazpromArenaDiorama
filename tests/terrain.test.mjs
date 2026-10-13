import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem } from '../src/materials/materials.js';
import {
  createTerrain,
  islandOutline,
  mainlandOutline,
  parkingOutline,
  arenaX,
} from '../src/world/terrain.js';

function makeTerrain() {
  const scene = new THREE.Scene();
  const { mat } = createMaterialSystem();
  let textureTarget = null;
  const terrain = createTerrain(scene, mat, {
    applyAsphalt(material) { textureTarget = material; },
  });
  return { scene, terrain, textureTarget };
}

test('legacy coastline and parking coordinates are preserved', () => {
  assert.equal(arenaX, 50);
  assert.deepEqual(islandOutline[0], [-25, -53]);
  assert.deepEqual(islandOutline[islandOutline.length - 1], [0, -52]);
  assert.deepEqual(mainlandOutline[0], [-89, -129]);
  assert.deepEqual(mainlandOutline[mainlandOutline.length - 1], [-89, -79]);
  assert.deepEqual(parkingOutline[0], [-25, -40]);
  assert.deepEqual(parkingOutline[parkingOutline.length - 1], [-28, -30]);
});

test('legacy terrain creates the correct layers, coastline, apron and parking', () => {
  const { scene, terrain, textureTarget } = makeTerrain();
  const objects = scene.children;
  // Keep the original ground layers while making room for the new access.
  assert.ok(terrain.accessRoad.parent === scene);
  assert.ok(arenaX - terrain.ringRoad.geometry.parameters.outerRadius - 1 > Math.max(...parkingOutline.map(p => p[0])), 'Arena apron must clear parking');
  assert.deepEqual(objects[0].position.toArray(), [0, -3, -24]);
  assert.equal(objects[0].geometry.parameters.width, 180);
  assert.deepEqual(objects[1].position.toArray(), [0, -0.7, -24]);
  assert.equal(objects[1].material, terrain.materials.sea);
  assert.equal(objects[2].geometry.type, 'ShapeGeometry');
  assert.equal(objects[2].position.y, -0.45);
  assert.equal(objects[3].geometry.type, 'ShapeGeometry');
  assert.equal(objects[3].position.y, -0.45);

  const apronIndex = 4 + islandOutline.length;
  const apron = objects[apronIndex];
  const parking = objects[apronIndex + 1];
  assert.deepEqual(apron.position.toArray(), [-10, -0.17, -44]);
  assert.equal(parking.geometry.type, 'ShapeGeometry');
  assert.equal(parking.position.y, -0.12);
  assert.strictEqual(apron.material, terrain.materials.asphalt);
  assert.strictEqual(parking.material, terrain.materials.asphalt);
  assert.strictEqual(textureTarget, terrain.materials.asphalt);
});

test('shifted ring retains its radii and marking dimensions', () => {
  const { scene, terrain } = makeTerrain();
  const ring = terrain.ringRoad;
  assert.ok(scene.children.includes(ring));
  assert.equal(ring.geometry.type, 'RingGeometry');
  assert.equal(ring.geometry.parameters.innerRadius, 29);
  assert.equal(ring.geometry.parameters.outerRadius, 35);
  assert.equal(ring.geometry.parameters.thetaSegments, 96);
  assert.deepEqual(ring.position.toArray(), [50, -0.13, 0]);
  assert.equal(ring.rotation.x, -Math.PI / 2);
  assert.strictEqual(ring.material, terrain.materials.road);

  const lastMarking = scene.children[scene.children.length - 1];
  assert.equal(lastMarking.geometry.parameters.width, 1.8);
  assert.equal(lastMarking.geometry.parameters.height, 0.035);
  assert.equal(lastMarking.geometry.parameters.depth, 0.12);
  assert.equal(lastMarking.castShadow, true);
  assert.equal(lastMarking.receiveShadow, true);
});
