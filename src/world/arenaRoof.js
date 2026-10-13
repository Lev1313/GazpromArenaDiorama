import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';

// Preserve the accepted roof footprint and crown. The membrane/glazing is an
// opaque low-poly approximation: the diorama has no modelled bowl interior.
export const closedRoof = Object.freeze({ halfWidth: 10.2, halfLength: 15, edgeY: 13.52, rise: 2.8, power: 2 / .62 });

export function roofHeight(x, z) {
  const { halfWidth, halfLength, edgeY, rise, power } = closedRoof;
  const u = (Math.abs(x / halfWidth) ** power + Math.abs(z / halfLength) ** power) ** (1 / power);
  return edgeY + rise * (1 - u * u);
}

/** Closed pair of roof leaves, derived from the legacy dome's radial mesh.
 * Official reference: https://gazprom-arena.com/technologies
 * Grid spacing/section sizes are diorama-scale interpretation, not surveyed dimensions.
 */
export function createClosedArenaRoof(stadium, mat) {
  const { line } = createPrimitives(stadium);
  const skin = mat(0x91b8c9, { roughness: .42, metalness: .16, side: THREE.DoubleSide });
  const frame = mat(0xd6e1e3, { roughness: .58, metalness: .28 });
  const joint = mat(0x5c7684, { roughness: .65 });
  const leaves = [];
  const { halfWidth: w, halfLength: l, edgeY, rise, power } = closedRoof;
  function edge(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [w * Math.sign(c) * Math.abs(c) ** .62, l * Math.sign(s) * Math.abs(s) ** .62];
  }
  // Two half-surfaces retain the original total 64 angular sectors and ten
  // radial layers. Their common seam is x=0; no original roof area is removed.
  for (let side = 0; side < 2; side++) {
    const vertices = [], indices = [], sectors = 32, layers = 10;
    for (let j = 0; j <= layers; j++) {
      const u = j / layers;
      for (let i = 0; i <= sectors; i++) {
        const [x, z] = edge(-Math.PI / 2 + side * Math.PI + i / sectors * Math.PI);
        vertices.push(x * u, edgeY + rise * (1 - u * u), z * u);
      }
    }
    for (let j = 0; j < layers; j++) for (let i = 0; i < sectors; i++) {
      const k = j * (sectors + 1) + i;
      indices.push(k, k + 1, k + sectors + 1, k + 1, k + sectors + 2, k + sectors + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const leaf = new THREE.Mesh(geometry, skin);
    leaf.name = side === 0 ? 'roof-leaf-east' : 'roof-leaf-west';
    leaf.castShadow = leaf.receiveShadow = true;
    stadium.add(leaf); leaves.push(leaf);
  }
  const ribs = [];
  function curve(points, material, radius) {
    for (let i = 1; i < points.length; i++) ribs.push(line(points[i - 1], points[i], material, radius));
  }
  const point = (x, z) => [x, roofHeight(x, z) + .085, z];
  // Fine transverse members continue across both leaves, but the darker
  // longitudinal meeting joint makes their separation legible from above.
  for (let z = -13.5; z <= 13.5; z += 1.5) {
    const limit = w * (1 - Math.abs(z / l) ** power) ** (1 / power);
    curve(Array.from({ length: 17 }, (_, i) => point(-limit + 2 * limit * i / 16, z)), frame, .035);
  }
  for (const x of [-8, -6, -4, -2, 2, 4, 6, 8]) {
    const limit = l * (1 - Math.abs(x / w) ** power) ** (1 / power);
    curve(Array.from({ length: 21 }, (_, i) => point(x, -limit + 2 * limit * i / 20)), frame, .028);
  }
  curve(Array.from({ length: 31 }, (_, i) => point(0, -l + i)), joint, .065);
  curve(Array.from({ length: 65 }, (_, i) => {
    const [x, z] = edge(i / 64 * Math.PI * 2);
    return [x, edgeY + .09, z];
  }), frame, .07);
  return { leaves, ribs };
}
