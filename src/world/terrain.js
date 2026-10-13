import * as THREE from 'three';
import { createBaseMaterials } from '../materials/materials.js';
import { applyAsphaltTexture } from '../materials/textures.js';
import { createPrimitives } from '../utils/primitives.js';
import { arenaX, ring, accessOutlines, eastAccess } from './siteLayout.js';
export { arenaX } from './siteLayout.js';

// Legacy shore/parking outlines; stage 6.3 separates arena and parking.
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


/**
 * Build ground, water, coast, parking and the connected arena ring road.
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
    const next = promenade[(i + 1) % promenade.length];
    if (promenade[i].x === 89 && next.x === 89) {
      // The east side is the diorama cut: leave the future traffic entry open.
      const edge = new THREE.Group();
      scene.add(edge);
      line([89, -.25, 42], [89, -.25, 35.5], concrete, .38, edge);
      line([89, -.25, 28.5], [89, -.25, -48], concrete, .38, edge);
      continue;
    }
    line(
      promenade[i].toArray(),
      promenade[(i + 1) % promenade.length].toArray(),
      concrete,
      0.38,
    );
  }

  // Apron and expanded car-meet parking area east of the elevated highway.
  cube(9, 0.08, 11, road, -10, -0.17, -44);
  polygon(parkingOutline, -0.12, road);
  applyAsphalt(asphalt);

  cube(0.3, 0.18, 62, concrete, -27.5, -0.08, 0);
  // North-east gate occupies z=-34..-28; no curb across its mouth.
  for (const [start, end] of [[-28, -3], [3, 28]]) {
    cube(0.3, 0.18, end - start, concrete, 11.5, -0.08, (start + end) / 2);
  }
  for (const z of [-40, 40]) {
    cube(29, 0.18, 0.3, concrete, -8, -0.08, z);
  }

  // Separate the wider apron from the road in depth, including the high camera.
  cyl(ring.outer + 1, ring.outer + 1, 0.18, slab, arenaX, -0.34, 0, 80);
  const ringRoad = new THREE.Mesh(new THREE.RingGeometry(ring.inner, ring.outer, 96), road);
  ringRoad.rotation.x = -Math.PI / 2;
  ringRoad.position.set(arenaX, -0.13, 0);
  scene.add(ringRoad);
  const accessRoads = accessOutlines.map(outline => polygon(outline, -.115, road));
  const accessRoad = accessRoads[0];
  for (const z of [-31, 31]) for (let x = 16; x <= 36; x += 4) cube(1.8, .025, .12, white, x, -.09, z);
  cube(1.8, .025, .12, white, 12, -.09, 0);

  // Yuzhnaya-inspired eastern approach, tangent to the southern ring arc.
  const eastRoad = polygon(eastAccess, -.115, road);
  for (let x = 60; x <= 88; x += 4) cube(1.8, .025, .12, white, x, -.09, 32);
  cube(17, .1, .65, concrete, 80.5, -.18, 28.5);
  cube(29, .1, .65, concrete, 74.5, -.18, 35.5);
  cube(4.5, 0.07, 11, slab, 86.75, -0.15, 16);
  for (let i = 0; i < 40; i++) {
    const a = i * Math.PI / 20;
    if ((Math.cos(a) < 0 && (Math.abs(Math.sin(a)) > .7 || Math.abs(Math.sin(a)) < .12))
      || (Math.cos(a) >= 0 && Math.sin(a) > .88)) continue;
    cube(
      1.8, 0.035, 0.12, white,
      arenaX + (ring.inner + ring.outer) / 2 * Math.cos(a),
      -0.025,
      (ring.inner + ring.outer) / 2 * Math.sin(a),
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
    accessRoad,
    accessRoads,
    eastRoad,
  };
}
