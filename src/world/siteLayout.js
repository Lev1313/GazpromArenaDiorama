// Shared scene-scale layout, not surveyed geographic coordinates.
export const arenaX = 50;
export const ring = Object.freeze({ inner: 29, outer: 35 });
export const accessWidth = 6;
const straightAccess = (z, end) => [[8, z - accessWidth / 2], [end, z - accessWidth / 2],
  [end, z + accessWidth / 2], [8, z + accessWidth / 2]];
export const accessOutline = straightAccess(-31, 42);
export const middleAccess = straightAccess(0, 21);
export const southAccess = straightAccess(31, 42);
export const accessOutlines = [accessOutline, middleAccess, southAccess];
// Compressed interpretation of Yuzhnaya Road continuing east past the arena.
// Visitors enter and leave at the east edge; Golf remains inside the board.
export const eastArrival = Object.freeze({ edgeX: 89, stagingX: 86, ringX: 50, z: 32, width: 6 });
export const eastAccess = [[50, 29], [89, 29], [89, 35], [50, 35]];
export const parkingLights = [-26, 10].flatMap(x => [-28, 0, 28].map(z => [x, x === 10 && z === 0 ? -5.5 : z]));

export function pointInPolygon(x, z, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i], [xj, zj] = outline[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function driveArea(lotOutline) {
  return (x, z) => {
    const radius = Math.hypot(x - arenaX, z);
    return pointInPolygon(x, z, lotOutline) || accessOutlines.some(outline => pointInPolygon(x, z, outline))
      || pointInPolygon(x, z, eastAccess)
      || (radius >= ring.inner && radius <= ring.outer);
  };
}
