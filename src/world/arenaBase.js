import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';

// Keep the accepted podium height and maximum radius; stairs end before the
// ring road (r=29). Dimensions are a diorama interpretation of ground photos.
export const podium = Object.freeze({ radius: 24.6, deckY: 1.75, groundY: -.17,
  stairStart: 24.35, tread: .38, steps: 10, width: 3.6, entrances: 16 });

export function createArenaBase(stadium, mat, concrete, steel) {
  const group = new THREE.Group();
  group.name = 'arena-podium';
  stadium.add(group);
  const { cyl, line } = createPrimitives(group);
  const { radius, deckY, groundY, stairStart, tread, steps, width, entrances } = podium;
  const cladding = mat(0x959e9f, { roughness: .85 });
  const joints = mat(0x657477, { roughness: .9 });
  // Vertical panelled retaining face instead of the broad sloping cone.
  cyl(radius - .08, radius - .08, deckY - groundY - .18,
    cladding, 0, (deckY + groundY - .18) / 2, 0, 96);
  cyl(radius, radius, .18, concrete, 0, deckY - .09, 0, 96);
  const radial = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)];
  const stairs = [];
  const rise = (deckY - groundY) / steps;
  for (let i = 0; i < entrances; i++) {
    const angle = i * Math.PI * 2 / entrances;
    const flight = new THREE.Group();
    flight.name = `podium-stair-${i}`;
    flight.rotation.y = Math.PI / 2 - angle;
    flight.position.set(stairStart * Math.cos(angle), 0, stairStart * Math.sin(angle));
    group.add(flight);
    const local = createPrimitives(flight);
    for (let step = 0; step < steps; step++) {
      const top = deckY - step * rise;
      // Solid risers reach the plaza. Adjacent treads touch without floating gaps.
      local.cube(width, top - groundY, tread, concrete,
        0, (top + groundY) / 2, (step + .5) * tread);
    }
    // Handrails descend to the last tread; posts actually meet the steps.
    for (const x of [-width / 2 + .12, width / 2 - .12]) {
      for (const step of [0, 3, 6, 9]) {
        const y = deckY - step * rise, z = (step + .5) * tread;
        local.line([x, y, z], [x, y + .8, z], steel, .035);
      }
      local.line([x, deckY + .8, .5 * tread],
        [x, deckY - (steps - 1) * rise + .8, (steps - .5) * tread], steel, .045);
    }
    stairs.push(flight);

    // Leave each stair mouth open; join the intervening arc with a light railing.
    const gap = Math.asin((width / 2 + .12) / (radius - .15));
    const start = angle + gap, end = angle + Math.PI * 2 / entrances - gap;
    for (let j = 0; j <= 6; j++) {
      const a = start + (end - start) * j / 6;
      line(radial(radius - .15, a, deckY), radial(radius - .15, a, deckY + .8), steel, .03);
      line(radial(radius - .075, a, groundY + .05),
        radial(radius - .075, a, deckY - .2), joints, .015);
      if (j < 6) {
        const b = start + (end - start) * (j + 1) / 6;
        for (const y of [deckY + .4, deckY + .8]) {
          line(radial(radius - .15, a, y), radial(radius - .15, b, y), steel, .03);
        }
      }
    }
  }
  return { group, stairs };
}
