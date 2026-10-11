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
  assert.equal(arena.stadium.children.length, 300);
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
  const dome = arena.stadium.children.find(
    (mesh) => mesh.geometry.getAttribute('position').count === 11 * 65,
  );
  assert.ok(dome, 'double retractable roof surface');
  assert.equal(dome.material.side, THREE.DoubleSide);
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
