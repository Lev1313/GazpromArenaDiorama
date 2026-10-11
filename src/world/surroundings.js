import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';
import { surfaceSign as defaultSurfaceSign, label as defaultLabel } from '../utils/signs.js';

/**
 * Legacy trees, parking lights, railings, road markings and area labels.
 * Except for dependency injection and the extracted label helper, the
 * geometry is copied from the original HTML (no coordinate changes).
 * @param {THREE.Scene} scene
 * @param {Function} mat
 * @param {Object} materials
 * @param {number} arenaX
 * @param {number[][]} islandOutline
 * @param {THREE.Material} steel
 * @param {{ makeSurfaceSign?: Function, makeLabel?: Function }} options
 */
export function createSurroundings(
  scene, mat, materials, arenaX, islandOutline, steel,
  { makeSurfaceSign = defaultSurfaceSign, makeLabel = defaultLabel } = {},
) {
  const { cube, cyl, line } = createPrimitives(scene);
  const { concrete, slab, white, gold } = materials;
  const island = islandOutline;
  const surfaceSign = makeSurfaceSign;

function tree(x,z,sc=1){cyl(.13,.22,2.3*sc,mat(0x74685a),x,.9*sc,z,6);for(const [dx,dy,dz,r,c] of [[0,3,0,1.5,0x4c7651],[-.7,2.7,.4,1,0x3b6647],[.6,3.5,-.25,1.05,0x5c8559]]){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(r*sc,0),mat(c));crown.position.set(x+dx*sc,dy*sc,z+dz*sc);crown.castShadow=true;scene.add(crown);}}
for(let i=0;i<42;i++){const x=77+(i%4)*3.2,z=-43+Math.floor(i/7)*12;tree(x,z,.75);}
for(let i=0;i<25;i++)tree(-80+i*5,-120,.9);
function lamp(x,z,high=false){const h=high?11:6.5,dark=mat(0x454e52,{metalness:.4,roughness:.55});cyl(.07,.17,h,dark,x,h/2-.2,z,8);cube(.6,.35,.6,concrete,x,0,z);
 if(high){for(const dx of [-.75,.75])for(const dz of [-.45,.45]){line([x,h-.2,z],[x+dx,h+.1,z+dz],dark,.055);const head=cube(.58,.18,.48,steel,x+dx,h+.1,z+dz);cube(.5,.025,.41,gold,x+dx,h-.01,z+dz);}}
 else{const pts=[[x,h-1,z],[x,h+.25,z],[x+.45,h+.6,z],[x+.8,h+.25,z],[x+.8,h-.1,z]];for(let i=0;i<pts.length-1;i++)line(pts[i],pts[i+1],dark,.055);cyl(.26,.4,.26,dark,x+.8,h-.12,z,8);cyl(.23,.15,.37,gold,x+.8,h-.4,z,8);}
 const l=new THREE.PointLight(0xffcc8a,high?15:5,high?22:13,2);l.position.set(x,high?h:5.7,z);scene.add(l);
}
for(const x of [-26,10])for(const z of [-28,0,28])lamp(x,z,true);
for(let i=0;i<10;i++){const a=i*Math.PI/5;lamp(arenaX+33*Math.cos(a),33*Math.sin(a));}
// Mesh fences, pedestrian signs and parking totems copied as forms from the location photos.
const fenceMat=mat(0x718080,{metalness:.25,roughness:.7});
function fence(a,b,height=1.6){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),n=Math.ceil(A.distanceTo(B)/1.3);for(let i=0;i<=n;i++){const p=A.clone().lerp(B,i/n);line([p.x,0,p.z],[p.x,height,p.z],fenceMat,i%4===0?.055:.027);}for(const y of [.25,height])line([A.x,y,A.z],[B.x,y,B.z],fenceMat,.038);}
fence([11.7,0,-30],[11.7,0,30]);fence([-27.8,0,-29],[-27.8,0,29]);
for(const [x,z,face] of [[9,-36,-Math.PI/2],[-24,-36,Math.PI/2],[9,37,-Math.PI/2]]){cube(.75,3,.28,mat(0x145476),x,1.4,z,face);const sign=surfaceSign('P',0xffffff,0x12628b,1.05,1.1);sign.position.set(x,2.5,z+.16);sign.rotation.y=face;scene.add(sign);cube(.9,.22,.7,concrete,x,0,z);}
for(const z of [-39,39])for(let i=0;i<7;i++)cube(1.45,.025,.62,white,-9+i*1.7,-.09,z);
for(const x of [-25.9,9.8])for(const z of [-35,35]){cyl(.08,.09,3.8,fenceMat,x,1.8,z,6);const sign=surfaceSign('ПЕШЕХОДЫ',0xffffff,0x285f80,1.6,.65);sign.position.set(x,3.6,z);scene.add(sign);}
// Small paved footpaths, low planters, drainage channels and utility covers.
for(const x of [-29.7,13.3]){cube(2.2,.1,65,mat(0xa1a69e),x,-.2,0);for(const z of [-32,32]){cube(1.4,.25,4,concrete,x,0,z);cube(1.13,.16,3.73,mat(0x466949),x,.18,z);}}
for(const [x,z] of [[-4,-26],[-5,28],[-16,4],[.6,-5]]){cyl(.42,.42,.035,mat(0x4f575c),x,-.08,z,12);for(let i=-2;i<=2;i++)cube(.62,.013,.025,mat(0x29343c),x,-.054,z+i*.12);}
for(const x of [-25,9])for(let j=0;j<6;j++){cube(.32,.025,2.5,mat(0x46515a),x,-.09,-25+j*10);for(let k=0;k<7;k++)cube(.3,.015,.035,concrete,x,-.073,-26+j*10+k*.35);}
// Repair patches are subtle, allowing the rubber marks to remain visible.
for(const [x,z,w,d] of [[-7,25,6,2],[-17,-30,3,4],[0,-25,4,1.7],[-19,6,2,3]])cube(w,.015,d,mat(0x454d52),x,-.103,z);
// Retaining wall and promenade handrails along the water's edge.
for(let i=0;i<island.length-1;i++){const a=island[i],b=island[i+1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(a[0]>60&&b[0]>60)continue;cube(len,.65,.55,concrete,(a[0]+b[0])/2,-.45,(a[1]+b[1])/2,-Math.atan2(dz,dx));line([a[0],.65,a[1]],[b[0],.65,b[1]],fenceMat,.04);for(let j=0;j<=Math.ceil(len/2.7);j++){const t=j/Math.ceil(len/2.7);line([a[0]+dx*t,-.1,a[1]+dz*t],[a[0]+dx*t,.7,a[1]+dz*t],fenceMat,.035);}}
// North marker and landmark labels.
// Canvas-based landmark labels are handled by the shared helper.
const label = (text, x, z) => makeLabel(scene, text, x, z);
label('ЛАХТА · расстояние сжато',-61,-78);label('КРЕСТОВСКИЙ ОСТРОВ',54,49);label('СЕВЕР ↑',78,-78);

  return { fenceMat };
}
