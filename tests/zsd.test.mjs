import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem, createBaseMaterials } from '../src/materials/materials.js';
import { createZsd } from '../src/world/zsd.js';

function buildZsd() {
  const scene = new THREE.Scene();
  const { mat } = createMaterialSystem();
  const materials = createBaseMaterials(mat);
  const highway = createZsd(scene, mat, materials);
  return { scene, highway, materials };
}

test('original ZSD curve has seven control points and its x offset is preserved', () => {
  const { highway } = buildZsd();
  assert.equal(highway.highwayCurve.points.length, 7);
  assert.deepEqual(highway.highwayCurve.points[0].toArray(), [-21, 16.8, 77]);
  assert.deepEqual(highway.highwayCurve.points[6].toArray(), [26, 16.8, -120]);

  // lane 5.2 cancels the perpendicular shift, leaving the curve centerline.
  assert.ok(highway.highwayPoint(0, 5.2).distanceTo(
    highway.highwayCurve.getPointAt(0),
  ) < 1e-9);
  assert.ok(highway.highwayPoint(1, 5.2).distanceTo(
    highway.highwayCurve.getPointAt(1),
  ) < 1e-9);

  // Default lane retains the deliberate -5.2 sideways displacement.
  assert.ok(Math.abs(
    highway.highwayPoint(0).distanceTo(highway.highwayPoint(0, 5.2)) - 5.2,
  ) < 1e-9);
});

test('original ZSD segment counts, piers, markings and stays are preserved', () => {
  const { scene } = buildZsd();
  // 100 highway steps: 50 * 13 + 50 * 21 = 1700 meshes;
  // 11 paired pier assemblies: 77; 27 * 2 light standards: 216;
  // 2 cable-stayed pylons with 24 stays each: 50.
  assert.equal(scene.children.length, 2043);
  assert.ok(scene.children.every((obj) => obj.isMesh));
  const transparentScreens = scene.children.filter(
    (obj) => obj.material.transparent && obj.material.opacity === 0.58,
  );
  assert.equal(transparentScreens.length, 200);
  assert.ok(transparentScreens.every((obj) => obj.material.depthWrite === false));
});

test('bridge deck and light standards retain exact dimensions', () => {
  const { scene, materials } = buildZsd();
  const firstDeck = scene.children[0];
  assert.equal(firstDeck.geometry.type, 'BoxGeometry');
  assert.equal(firstDeck.geometry.parameters.height, 1.4);
  assert.equal(firstDeck.geometry.parameters.depth, 19.6);
  assert.equal(firstDeck.position.y, 15.9);
  assert.strictEqual(firstDeck.material, materials.concrete);
  assert.equal(firstDeck.castShadow, true);

  const firstSurface = scene.children[1];
  assert.equal(firstSurface.geometry.parameters.height, 0.12);
  assert.equal(firstSurface.geometry.parameters.depth, 19.2);
  assert.equal(firstSurface.position.y, 16.66);
  assert.strictEqual(firstSurface.material, materials.road);

  const masts = scene.children.filter(
    (obj) => obj.isMesh
      && obj.geometry.type === 'CylinderGeometry'
      && obj.geometry.parameters.height === 45.5,
  );
  assert.equal(masts.length, 2);
  assert.ok(masts.every((obj) => obj.geometry.parameters.radialSegments === 8));
});
