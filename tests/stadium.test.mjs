import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createTerrain } from '../src/world/terrain.js';
import { createStadium } from '../src/world/stadium.js';

function buildArena() {
  const scene = new THREE.Scene();
  const { mat } = createMaterialSystem();
  const { materials, arenaX } = createTerrain(scene, mat, {
    applyAsphalt() {}, // Canvas 2D is not available in Node.
  });
  let signArgs = null;
  const arena = createStadium(scene, mat, materials, arenaX, {
    makeSurfaceSign(...args) {
      signArgs = args;
      return new THREE.Mesh(
        new THREE.PlaneGeometry(13, 1.1),
        new THREE.MeshBasicMaterial(),
      );
    },
  });
  return { scene, arena, arenaX, signArgs };
}

test('stadium group and facade sign match the legacy placement', () => {
  const { scene, arena, arenaX, signArgs } = buildArena();
  assert.equal(arenaX, 41);
  assert.deepEqual(arena.stadium.position.toArray(), [41, 0, 0]);
  assert.ok(scene.children.includes(arena.stadium));
  assert.equal(arena.retractableRoof.leaves.length, 2);
  assert.deepEqual(signArgs, ['ГАЗПРОМ АРЕНА', 0xe9faff, 0x244558, 13, 1.1]);
  assert.ok(scene.children.includes(arena.arenaSign));
  assert.deepEqual(arena.arenaSign.position.toArray(), [arenaX - 24.3, 10.2, 0]);
  assert.equal(arena.arenaSign.rotation.y, -Math.PI / 2);
});

test('roof geometry and glazing retain the original dimensions', () => {
  const { arena } = buildArena();
  assert.equal(arena.roof.geometry.type, 'BufferGeometry');
  assert.equal(arena.roof.geometry.getAttribute('position').count, 6 * 97);
  assert.equal(arena.roof.material.side, THREE.DoubleSide);
  const leaves = arena.retractableRoof.leaves;
  assert.equal(leaves.length, 2);
  for (const leaf of leaves) {
    assert.equal(leaf.material.side, THREE.DoubleSide);
    assert.ok(Array.from(leaf.geometry.attributes.position.array).every(Number.isFinite));
    leaf.geometry.computeBoundingBox();
    const bounds = leaf.geometry.boundingBox;
    assert.ok(Math.abs(bounds.min.z + 15) < 1e-5 && Math.abs(bounds.max.z - 15) < 1e-5);
    assert.ok(Math.abs(bounds.min.y - 13.52) < 1e-5 && Math.abs(bounds.max.y - 16.32) < 1e-5);
  }
  assert.ok(Math.abs(leaves[0].geometry.boundingBox.min.x) < 1e-5);
  assert.ok(Math.abs(leaves[1].geometry.boundingBox.max.x) < 1e-5);
  assert.equal(leaves.reduce((n, leaf) => n + leaf.geometry.index.count, 0), 10 * 64 * 6);
  assert.equal(arena.steel.color.getHex(), 0xc5cbc9);
  assert.equal(arena.facade.color.getHex(), 0x345063);
});

test('eight mast warning lights and the surrounding architecture are present', () => {
  const { scene, arena } = buildArena();
  const warningLights = scene.children.filter(
    (obj) => obj.isMesh
      && obj.material?.color?.getHex() === 0xff4444
      && obj.material?.emissive?.getHex() === 0xff1200,
  );
  assert.equal(warningLights.length, 8);
  // Legacy roof seams, support rods, stairs and galleries live in scene,
  // not in the translated stadium group. Preserve this until batching.
  assert.ok(scene.children.length > 800);
  assert.equal(arena.stadium.children[0].geometry.type, 'CylinderGeometry');
  assert.equal(arena.stadium.children[0].geometry.parameters.radiusTop, 23.6);
  assert.equal(arena.stadium.children[0].geometry.parameters.radiusBottom, 24.6);
});
