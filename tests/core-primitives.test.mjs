import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem, createBaseMaterials } from '../src/materials/materials.js';
import { createPrimitives } from '../src/utils/primitives.js';

test('legacy material defaults and cache semantics', () => {
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  const a = mat(0x4b5056);
  const b = mat(0x4b5056);
  assert.strictEqual(a, b);
  assert.equal(a.roughness, 0.72);
  assert.equal(a.metalness, 0.08);

  const emissive = mat(0x1689ff, { emissive: 0x0752ce, emissiveIntensity: 1.2 });
  assert.equal(emissive.emissiveIntensity, 1.2);
  assert.equal(emissive.emissive.getHex(), 0x0752ce);

  stopSharingStaticMaterials();
  const after1 = mat(0x4b5056);
  const after2 = mat(0x4b5056);
  assert.notStrictEqual(after1, after2);
  assert.notStrictEqual(a, after1);
});

test('initial palette maintains the legacy material values', () => {
  const { mat } = createMaterialSystem();
  const palette = createBaseMaterials(mat);
  assert.equal(palette.asphalt.color.getHex(), 0x4b5056);
  assert.equal(palette.road.color.getHex(), 0x353d44);
  assert.equal(palette.gold.emissiveIntensity, 1.4);
  assert.equal(palette.glass.metalness, 0.65);
});

test('cube and cylinder use the legacy placement/shadow defaults', () => {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshStandardMaterial();
  const { cube, cyl } = createPrimitives(scene);
  const box = cube(5, 2, 3, mat, 1, 2, 3, 0.2);
  assert.equal(scene.children[0], box);
  assert.deepEqual(box.position.toArray(), [1, 2, 3]);
  assert.equal(box.rotation.y, 0.2);
  assert.equal(box.castShadow, true);
  assert.equal(box.receiveShadow, true);
  assert.equal(box.geometry.parameters.width, 5);

  const cylinder = cyl(2, 3, 4, mat, -1, 5, 6);
  assert.equal(cylinder.geometry.parameters.radialSegments, 12);
  assert.equal(cylinder.castShadow, true);
  assert.equal(cylinder.receiveShadow, true);
});

test('line midpoint, length and shadow behaviour match the legacy', () => {
  const scene = new THREE.Scene();
  const { line } = createPrimitives(scene);
  const segment = line([0, 0, 0], [0, 10, 0], new THREE.MeshStandardMaterial());
  assert.deepEqual(segment.position.toArray(), [0, 5, 0]);
  assert.equal(segment.geometry.parameters.height, 10);
  assert.equal(segment.geometry.parameters.radialSegments, 6);
  assert.equal(segment.castShadow, false);
  assert.equal(segment.receiveShadow, false);
});

test('polygon uses XZ points, -90 degree rotation and a receiving surface', () => {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshStandardMaterial();
  const { polygon } = createPrimitives(scene);
  const p = polygon([[0, 0], [4, 0], [4, 4], [0, 4]], -0.45, mat);
  assert.equal(p.position.y, -0.45);
  assert.equal(p.rotation.x, -Math.PI / 2);
  assert.equal(p.receiveShadow, true);
  assert.ok(p.geometry.attributes.position.count >= 3);
});
