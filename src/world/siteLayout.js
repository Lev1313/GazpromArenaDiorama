import { Vector3 } from 'three';

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

// Ground driving can leave the asphalt but stays on the island and clear of
// the raised stadium podium/stairs. The elevated ZSD is not a ground surface.
export function freeDriveArea(landOutline) {
  return (x,z) => pointInPolygon(x,z,landOutline) && Math.hypot(x-arenaX,z)>=24.6;
}

function convexHull(points) {
  const sorted=[...new Map(points.map(p=>[`${p[0]},${p[1]}`,p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=values=>{
    const result=[];
    for(const p of values){while(result.length>=2&&turn(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}
    return result;
  };
  return [...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)];
}

/** Capture ground-level solid bounds before architecture is merged. */
export function groundObstacles(scene) {
  const obstacles=[];
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(!o.isMesh || !['BoxGeometry','CylinderGeometry'].includes(o.geometry.type))return;
    const g=o.geometry;
    if(!g.boundingBox)g.computeBoundingBox();
    const box=g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    // Flat asphalt/grass/curbs can be crossed; higher solid objects cannot.
    if(box.max.y<=.35 || box.min.y>=1.65)return;
    // Clip geometry to vehicle height before projecting onto the ground.
    // A rotated fence or inclined support must not fill its entire world AABB.
    const vertices=Array.from({length:g.attributes.position.count},(_,i)=>
      new Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(o.matrixWorld));
    const points=vertices.filter(p=>p.y>=-.5&&p.y<=1.7).map(p=>[p.x,p.z]);
    const count=g.index?.count ?? vertices.length;
    for(let i=0;i<count;i+=3)for(let j=0;j<3;j++){
      const a=vertices[g.index?g.index.getX(i+j):i+j];
      const b=vertices[g.index?g.index.getX(i+(j+1)%3):i+(j+1)%3];
      for(const y of [-.5,1.7])if((a.y<y&&b.y>y)||(b.y<y&&a.y>y)){
        const t=(y-a.y)/(b.y-a.y);points.push([a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t]);
      }
    }
    const outline=convexHull(points);
    if(outline.length<3)return;
    obstacles.push({outline,minX:Math.min(...outline.map(p=>p[0])),maxX:Math.max(...outline.map(p=>p[0])),
      minZ:Math.min(...outline.map(p=>p[1])),maxZ:Math.max(...outline.map(p=>p[1])),minY:box.min.y,maxY:box.max.y});
  });
  return obstacles;
}
