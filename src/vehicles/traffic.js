import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';

/**
 * Original 14 ZSD vehicles and 3 visitor cars.
 *
 * Cars, routes, coordinates, colors, delays and travel speeds are copied
 * from the legacy HTML. The highway curve/functions are returned by
 * createZsd(), while parking markings are returned by createParkingMeet().
 *
 * This module owns only traffic. Drift, UI and Golf driving are independent.
 * An optional Golf position allows a visitor to yield in a later stage.
 *
 * @param {THREE.Scene} scene
 * @param {{car:Function,palette:number[]}} carFactory
 * @param {{highwayCurve:THREE.CatmullRomCurve3, highwayPoint:Function}} highway
 * @param {THREE.Material} markings
 */
export function createTrafficSystem(scene, carFactory, highway, markings) {
  const { car, palette } = carFactory;
  const { highwayCurve, highwayPoint } = highway;
  const { cube } = createPrimitives(scene);

const highCars=[];for(let i=0;i<14;i++)highCars.push({o:car(palette[(i+2)%7]),t:(i%7)/7,direction:i<7?1:-1,lane:(i<7?1:-1)*(1.5+(i%4)*2.2)});
function route(points){return new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],0,p[1])),false,'centripetal');}
const visitors=[];for(let i=0;i<3;i++){const x=-17+i*9,o=car(palette[i+3]);const arrive=route([[-10,-48],[-10,-39],[x,-37],[x,-32]]),leave=route([[x,-32],[x,-37],[-10,-40],[-10,-48]]);visitors.push({o,arrive,leave,state:'arrive',t:0,wait:0,delay:i*12,parkTime:22+i*6});o.visible=false;for(const dx of [-2.4,2.4])cube(.1,.025,5,markings,x+dx,-.015,-32);}
function place(o,p,t){o.position.copy(p.getPointAt(t));const d=p.getTangentAt(t);o.rotation.y=-Math.atan2(d.z,d.x);}

  /**
   * Move vehicles for one simulation step.
   * @param {number} dt - simulation time in seconds, clamped by main RAF
   * @param {{ driving?:boolean, golfPosition?:THREE.Vector3|null }} options
   */
  function update(dt, { driving = false, golfPosition = null } = {}) {
 for(const c of highCars){c.t=(c.t+dt*.025)%1;const t=c.direction===1?c.t:1-c.t,d=highwayCurve.getTangentAt(t);c.o.position.copy(highwayPoint(t,c.lane));c.o.rotation.y=-Math.atan2(d.z,d.x)+(c.direction===1?0:Math.PI);}
 for(const c of visitors){if(c.delay>0){c.delay-=dt;continue;}c.o.visible=true;if(c.state==='park'){c.wait+=dt;if(c.wait>=c.parkTime){c.state='leave';c.t=0;}continue;}const p=c.state==='arrive'?c.arrive:c.leave,nextT=Math.min(1,c.t+dt*3/p.getLength()),nextPos=p.getPointAt(nextT);if(driving && golfPosition && nextPos.distanceTo(golfPosition) < 4.6) continue;c.t=nextT;place(c.o,p,c.t);if(c.t>=1){if(c.state==='arrive'){c.state='park';c.wait=0;}else{c.state='arrive';c.t=0;c.delay=14;c.o.visible=false;}}}
  }

  // Matches the legacy updateTraffic(0) initial placement.
  update(0);

  return {
    highCars,
    visitors,
    route,
    place,
    update,
    get parkedVisitorCount() {
      return visitors.filter(c => c.state === 'park').length;
    },
  };
}
