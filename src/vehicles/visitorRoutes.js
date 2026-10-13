import * as THREE from 'three';
import { arenaX, eastArrival } from '../world/siteLayout.js';

export function visitorCurve(points) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x,z]) => new THREE.Vector3(x,0,z)), false, 'centripetal');
  curve.arcLengthDivisions = 2000;
  return curve;
}
function arc(radius, from, to) {
  const count = Math.ceil(Math.abs(to-from)/5);
  return Array.from({length:count+1}, (_,i) => {
    const a=(from+(to-from)*i/count)*Math.PI/180;
    return [arenaX+radius*Math.cos(a),radius*Math.sin(a)];
  });
}

export function createVisitorRoutes(x) {
  const outside = eastArrival.edgeX + 6;
  const arrive = visitorCurve([
    [outside,30.5],[80,30.5],[60,30.5], ...arc(30.5,90,235),
    [34,-28],[33,-31],[28,-32.5],[14,-32.5],[8,-30.5],
    [x+4,-30.5],[x,-32],[x,-35],
  ]);
  // Reverse out of the bay, ending facing east before the forward departure.
  const reverse = visitorCurve([[x,-35],[x,-32],[x-1,-29.5],[x-4,-29.5]]);
  const leave = visitorCurve([
    [x-4,-29.5],[x,-29.5],[14,-29.5],[23,-29.5],
    [28,-29.5],[30,-27.5],[27.5,-25], ...arc(33.5,225,90),
    [60,33.5],[80,33.5],[outside,33.5],
  ]);
  return { arrive, reverse, leave };
}
