import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';

/**
 * Build the ZSD viaduct exactly as the original diorama.
 *
 * The source geometry below is copied from legacy/gazprom_arena_diorama.html
 * between the ZSD and Lakhta section markers. The scene, mat factory,
 * material palette and primitive helpers are injected instead of globals.
 *
 * Keep highwayPoint(t, lane) available for the later traffic migration.
 *
 * @param {THREE.Scene} scene
 * @param {(color:number, extra?:Object)=>THREE.MeshStandardMaterial} mat
 * @param {ReturnType<import('../materials/materials.js').createBaseMaterials>} materials
 * @returns {{ highwayCurve: THREE.CatmullRomCurve3, highwayPoint: (t:number,lane?:number)=>THREE.Vector3 }}
 */
export function createZsd(scene, mat, materials) {
  const { cube, cyl, line } = createPrimitives(scene);
  const { concrete, road, slab, white, gold } = materials;

// ZSD: eight traffic lanes, paired piers, side screens and curved white light standards.
const highwayCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-3,16.8,77),new THREE.Vector3(-10,16.8,42),new THREE.Vector3(-16,16.8,5),new THREE.Vector3(-13,16.8,-26),new THREE.Vector3(2,16.8,-58),new THREE.Vector3(30,16.8,-89),new THREE.Vector3(44,16.8,-120)],false,'centripetal');
for(const point of highwayCurve.points)point.x-=18;highwayCurve.updateArcLengths();
function highwayPoint(t,lane=0){const p=highwayCurve.getPointAt(t),d=highwayCurve.getTangentAt(t);return p.add(new THREE.Vector3(-d.z,0,d.x).multiplyScalar(lane-5.2));}
const highwayWhite=mat(0xd1d8d6,{metalness:.15,roughness:.65}),barrierMat=mat(0x9aa8ac),screenMat=mat(0x708c96,{transparent:true,opacity:.58,roughness:.45,metalness:.1,depthWrite:false}),screenBase=mat(0x788a91),girderMat=mat(0x586970);
for(let i=0;i<100;i++){const a=highwayPoint(i/100),b=highwayPoint((i+1)/100),mid=a.clone().add(b).multiplyScalar(.5),angle=-Math.atan2(b.z-a.z,b.x-a.x),len=a.distanceTo(b)+.12;
 cube(len,1.4,19.6,concrete,mid.x,15.9,mid.z,angle);cube(len,.12,19.2,road,mid.x,16.66,mid.z,angle);
 for(const lane of [-6.5,6.5]){const p=highwayPoint((i+.5)/100,lane);cube(len,1.1,1.7,girderMat,p.x,14.8,p.z,angle);}
 const center=highwayPoint((i+.5)/100);cube(len,.55,.42,barrierMat,center.x,17.05,center.z,angle);
 for(const lane of [-9.55,9.55]){const p=highwayPoint((i+.5)/100,lane);cube(len,.82,.2,screenBase,p.x,17.1,p.z,angle);cube(len,1.12,.10,screenMat,p.x,18.07,p.z,angle);cube(len,.09,.16,highwayWhite,p.x,18.66,p.z,angle);if(i%2===0)cube(.12,2.1,.14,highwayWhite,p.x,17.7,p.z,angle);}
 for(const lane of [-9.0,9.0]){const p=highwayPoint((i+.5)/100,lane);cube(len,.024,.09,white,p.x,16.735,p.z,angle);}
 if(i%2===0)for(const lane of [-7,-4.8,-2.6,2.6,4.8,7]){const p=highwayPoint((i+.5)/100,lane);cube(1.25,.026,.08,white,p.x,16.735,p.z,angle);}
}
for(let i=0;i<11;i++){const t=.025+i*.091,d=highwayCurve.getTangentAt(t),yaw=-Math.atan2(d.z,d.x);for(const lane of [-6.4,6.4]){const p=highwayPoint(t,lane);cube(2,13.1,1.45,concrete,p.x,6.1,p.z,yaw);cube(3.5,.6,3.6,slab,p.x,-.15,p.z,yaw);cube(2.6,1.15,3,concrete,p.x,13.1,p.z,yaw);}const p=highwayPoint(t);cube(3.1,.8,17,concrete,p.x,13.9,p.z,yaw);}
for(let i=0;i<27;i++)for(const side of [-1,1]){const t=.02+i*.0365;const p=highwayPoint(t,side*9.4),q=highwayPoint(t,side*7.5),r=highwayPoint(t,side*5.8),a=[p.x,16.8,p.z],b=[p.x,20.3,p.z],c=[q.x,22.1,q.z],d=[r.x,22.6,r.z];line(a,b,highwayWhite,.095);line(b,c,highwayWhite,.085);line(c,d,highwayWhite,.065);const tangent=highwayCurve.getTangentAt(t);cube(.42,.1,.8,gold,d[0],d[1],d[2],-Math.atan2(tangent.z,tangent.x));}
// Central pylons and fan stays on the northern water span (compressed distance).
for(const t of [.73,.93]){const p=highwayPoint(t),top=[p.x,45,p.z];cyl(.25,.9,45.5,highwayWhite,p.x,22.3,p.z,8);for(const sign of [-1,1])for(let j=1;j<=6;j++){const tt=Math.min(.998,Math.max(.001,t+sign*j*.012));for(const lane of [-8.8,8.8]){const q=highwayPoint(tt,lane);line([p.x,44-j*.8,p.z],[q.x,17.15,q.z],highwayWhite,.047);}}}

  return { highwayCurve, highwayPoint };
}
