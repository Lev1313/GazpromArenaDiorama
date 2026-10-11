import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem, createBaseMaterials } from '../src/materials/materials.js';
import { createLakhta } from '../src/world/lakhta.js';
import { createSurroundings } from '../src/world/surroundings.js';
import { islandOutline, arenaX } from '../src/world/terrain.js';

function setup() {
  const scene = new THREE.Scene();
  const { mat } = createMaterialSystem();
  const materials = createBaseMaterials(mat);
  const steel = mat(0xc5cbc9, { metalness: 0.3, roughness: 0.55 });
  return { scene, mat, materials, steel };
}

test('Lakhta retains five twisting wings, original anchor and height', () => {
  const { scene, mat, materials, steel } = setup();
  const { towerVertex, towerMats } = createLakhta(scene, mat, materials, steel);

  assert.equal(towerMats.length, 5);
  const wings = scene.children.filter(
    o => o.isMesh && o.geometry.type === 'BufferGeometry',
  );
  assert.equal(wings.length, 5);
  assert.ok(wings.every(m => m.geometry.attributes.position.count === 66));
  assert.ok(wings.every(m => m.geometry.index.count === 192));

  const bottom = towerVertex(0, 0);
  assert.ok(Math.abs(bottom.x - (-62 + 4.43)) < 1e-9);
  assert.equal(bottom.y, 0);
  assert.equal(bottom.z, -102);
  const spire = towerVertex(32, 0);
  assert.ok(Math.abs(spire.x + 62) < 1e-9);
  assert.equal(spire.y, 72);
  assert.ok(Math.abs(spire.z + 101.97) < 1e-9);
});

test('Lakhta neighbors and tower detailing match original dimensions', () => {
  const { scene, mat, materials, steel } = setup();
  createLakhta(scene, mat, materials, steel);
  // Each wing has one facade and 64 line segments; two 7-mesh buildings.
  assert.equal(scene.children.length, 339);
  assert.equal(scene.children.filter(o => o.material === materials.glass).length, 2);
  assert.equal(scene.children.filter(o => o.material === steel).length, 5 * 32 + 12);
});

test('landscaping preserves 67 trees and 16 point lights', () => {
  const { scene, mat, materials, steel } = setup();
  let signs = [];
  let labels = [];
  createSurroundings(scene, mat, materials, arenaX, islandOutline, steel, {
    makeSurfaceSign(...args) {
      signs.push(args);
      return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    },
    makeLabel(target, text, x, z) {
      labels.push([text, x, z]);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      target.add(sprite);
      return sprite;
    },
  });

  const lights = scene.children.filter(o => o.isPointLight);
  assert.equal(lights.length, 16);
  assert.equal(lights.filter(l => l.intensity === 15).length, 6);
  assert.equal(lights.filter(l => l.intensity === 5).length, 10);
  const treeTrunks = scene.children.filter(o =>
    o.isMesh && o.geometry.type === 'CylinderGeometry' &&
    o.geometry.parameters.radialSegments === 6 &&
    o.material?.color?.getHex() === 0x74685a
  );
  assert.equal(treeTrunks.length, 67);
  const crowns = scene.children.filter(o => o.geometry?.type === 'IcosahedronGeometry');
  assert.equal(crowns.length, 67 * 3);

  assert.equal(signs.length, 7);
  assert.equal(signs.filter(([text]) => text === 'P').length, 3);
  assert.equal(signs.filter(([text]) => text === 'ПЕШЕХОДЫ').length, 4);
  assert.deepEqual(labels, [
    ['ЛАХТА · расстояние сжато', -61, -78],
    ['КРЕСТОВСКИЙ ОСТРОВ', 54, 49],
    ['СЕВЕР ↑', 78, -78],
  ]);
});

test('surroundings retain fencing and coast handrails', () => {
  const { scene, mat, materials, steel } = setup();
  const { fenceMat } = createSurroundings(
    scene, mat, materials, arenaX, islandOutline, steel,
    {
      makeSurfaceSign: () => new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(),
      ),
      makeLabel: () => new THREE.Sprite(new THREE.SpriteMaterial()),
    },
  );
  assert.equal(fenceMat.color.getHex(), 0x718080);
  assert.ok(scene.children.some(o =>
    o.isMesh && o.geometry.type === 'BoxGeometry' &&
    o.geometry.parameters.width === 2.2 &&
    o.geometry.parameters.depth === 65
  ));
  assert.ok(scene.children.some(o =>
    o.isMesh && o.geometry.type === 'CylinderGeometry' &&
    o.geometry.parameters.height === 0.65
  ) === false); // Retaining walls use cuboids, not cylinders.
  const retainingWalls = scene.children.filter(o =>
    o.geometry?.type === 'BoxGeometry' &&
    o.geometry.parameters.height === 0.65 &&
    o.geometry.parameters.depth === 0.55
  );
  assert.ok(retainingWalls.length > 5);
});
