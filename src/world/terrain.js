import * as THREE from 'three';
import { createBaseMaterials } from '../materials/materials.js';
import { applyAsphaltTexture } from '../materials/textures.js';
import { createPrimitives } from '../utils/primitives.js';

// Geography copied from legacy/gazprom_arena_diorama.html.
// North is -Z, east is +X. The mainland distance is deliberately compressed.
export const islandOutline = [
  [-25, -53], [-38, -42], [-47, -26], [-51, -8], [-51, 12],
  [-47, 31], [-40, 47], [-22, 53], [-3, 48], [18, 52],
  [37, 47], [60, 42], [89, 42], [89, -48], [65, -49],
  [45, -47], [20, -49], [0, -52],
];

export const mainlandOutline = [
  [-89, -129], [89, -129], [89, -91], [57, -95],
  [18, -98], [-20, -92], [-59, -82], [-89, -79],
];

export const parkingOutline = [
  [-25, -40], [7, -40], [12, -33], [12, 33],
  [7, 40], [-24, 40], [-28, 30], [-28, -30],
];

export const arenaX = 41;

/**
 * Build the original diorama's ground, water, coast, parking and ring road.
 * Do not add buildings or vehicles here; those are later migration stages.
 *
 * The injectable asphalt function allows deterministic Node tests without
 * a browser canvas; the production default is the exact legacy texture.
 *
 * @param {THREE.Scene} scene
 * @param {Function} mat - material factory returned by createMaterialSystem()
 * @param {{applyAsphalt?: Function}} options
 */
export function createTerrain(scene, mat, { applyAsphalt = applyAsphaltTexture } = {}) {
  const { cube, cyl, line, polygon } = createPrimitives(scene);
  // Keep the legacy initial palette and allocation order.
  const materials = createBaseMaterials(mat);
  const { asphalt, road, slab, white, sea, forest, concrete } = materials;

  // Sea and base plate, in exactly the original order and coordinates.
  cube(180, 4, 210, mat(0x192131), 0, -3, -24);
  cube(179, 0.15, 209, sea, 0, -0.7, -24);

  polygon(islandOutline, -0.45, forest);
  polygon(mainlandOutline, -0.45, forest);

  const promenade = islandOutline.map(
    ([x, z]) => new THREE.Vector3(x, -0.25, z),
  );
  for (let i = 0; i < promenade.length; i++) {
    line(
      promenade[i].toArray(),
      promenade[(i + 1) % promenade.length].toArray(),
      concrete,
      0.38,
    );
  }

  // Apron and expanded car-meet parking area east of the elevated highway.
  cube(9, 0.08, 11, asphalt, -10, -0.17, -44);
  polygon(parkingOutline, -0.12, asphalt);
  applyAsphalt(asphalt);

  for (const x of [-27.5, 11.5]) {
    cube(0.3, 0.18, 62, concrete, x, -0.08, 0);
  }
  for (const z of [-40, 40]) {
    cube(29, 0.18, 0.3, concrete, -8, -0.08, z);
  }

  cyl(33, 33, 0.18, slab, arenaX, -0.26, 0, 80);
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(29, 32, 96), road);
  ringRoad.rotation.x = -Math.PI / 2;
  ringRoad.position.set(arenaX, -0.13, 0);
  scene.add(ringRoad);

  // Access roads and 40 short markings around the stadium's perimeter.
  cube(18, 0.15, 8, road, 81, -0.15, 0);
  cube(18, 0.07, 11, slab, 81, -0.15, 16);
  for (let i = 0; i < 40; i++) {
    const a = i * Math.PI / 20;
    cube(
      1.8, 0.035, 0.12, white,
      arenaX + 30.5 * Math.cos(a),
      -0.025,
      30.5 * Math.sin(a),
      -a - Math.PI / 2,
    );
  }

  return {
    materials,
    islandOutline,
    mainlandOutline,
    parkingOutline,
    arenaX,
    ringRoad,
  };
}
