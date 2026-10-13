import { Vector3, Box3 } from 'three';
import { pointInPolygon } from '../world/siteLayout.js';

/** Cache flat ground faces before batching, without raycasting heavy GLBs.
 * Ignore paint/grates, water, elevated structures and decorative thin strips.
 */
export function captureGroundSurface(scene) {
  const surfaces = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const g = o.geometry;
    g.computeBoundingBox();
    const bounds = new Box3().copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    if (bounds.min.y < -.5 || bounds.max.y > .35) return;
    if (['BoxGeometry', 'CylinderGeometry'].includes(g.type) && bounds.max.y - bounds.min.y < .05) return;
    const faces = [], positions = g.attributes.position, count = g.index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      const points = [0,1,2].map(j => new Vector3().fromBufferAttribute(positions,g.index ? g.index.getX(i+j) : i+j).applyMatrix4(o.matrixWorld));
      const [a,b,c] = points;
      if (Math.max(a.y,b.y,c.y)-Math.min(a.y,b.y,c.y) > 1e-5) continue;
      if (Math.abs((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z)) < .01) continue;
      faces.push({outline: points.map(p=>[p.x,p.z]), y:a.y});
    }
    if (faces.length) surfaces.push({bounds,faces});
  });
  return (x,z) => {
    let height = -.45;
    for (const {bounds,faces} of surfaces) {
      if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z || bounds.max.y < height) continue;
      for (const face of faces) if (face.y > height && pointInPolygon(x,z,face.outline)) height=face.y;
    }
    return height;
  };
}
