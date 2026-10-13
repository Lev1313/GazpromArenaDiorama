import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';

/**
 * Original 18 parked cars and 32 spectators, including the Golf VI, parking
 * lines and picnic tables. No traffic or drifters yet.
 *
 * @param {THREE.Scene} scene
 * @param {Function} mat
 * @param {Object} materials - initial palette from createTerrain()
 * @param {ReturnType<import('../vehicles/car.js').createCarFactory>} cars
 */
export function createParkingMeet(
  scene,
  mat,
  materials,
  cars,
) {
  const { cube } = createPrimitives(scene);
  const { slab, concrete } = materials;
  const { car, palette, rubber, windows } = cars;

const people=[],parked=[];
function person(x,z,color,pose=0){const g=new THREE.Group();const add=(geo,m,px,py,pz)=>{const o=new THREE.Mesh(geo,m);o.position.set(px,py,pz);g.add(o);return o};const cloth=mat(color);add(new THREE.CylinderGeometry(.23,.28,.68,5),cloth,0,.9,0);add(new THREE.IcosahedronGeometry(.22,1),mat(0xd7ad8f),0,1.49,0);for(const dx of [-.13,.13])add(new THREE.BoxGeometry(.15,.57,.19),rubber,dx,.32,0);for(const dx of [-.3,.3]){const arm=add(new THREE.BoxGeometry(.14,.5,.14),cloth,dx,pose?1.2:.9,.06);arm.rotation.z=pose?dx*2:dx*.5;}if(pose)add(new THREE.BoxGeometry(.22,.32,.055),windows,0,1.48,.29);g.position.set(x,0,z);g.rotation.y=x<-8?Math.PI/2:-Math.PI/2;scene.add(g);people.push(g);return g;}
const markings=mat(0x93a6ac),staticCount=18;
for(const x of [-22.4,6.1])for(let j=0;j<7;j++){
 const z=-24+j*8,o=car(palette[(j+(x>0?2:0))%7],{hatch:j%3===0||(x<0&&j===5)});o.position.set(x,0,z);o.rotation.y=x<0?0:Math.PI;parked.push(o);
 const relocated=x>0&&j===3;
 if(relocated){o.position.set(5.5,0,-37);o.rotation.y=Math.PI/2;}
 for(const dz of [-2.65,2.65]){const mark=cube(5.1,.025,.1,markings,x,-.015,z+dz);if(relocated){mark.position.set(5.5+dz*.53,-.015,-37);mark.rotation.y=Math.PI/2;}}
 for(let k=0;k<2;k++){const p=person(x+(x<0?-2.8:2.8),z-1.4+k*2.6,palette[(j+k+2)%7],(j+k)%3===0);if(relocated)p.position.set(3.3,0,-38.5+k*3);}
}
for(let j=0;j<4;j++){const o=car(palette[j],{sport:j===0});o.position.set(-19+j*7,0,33);o.rotation.y=Math.PI/2;parked.push(o);person(-19+j*7,37,palette[(j+2)%7],1);}
// Small picnic points and a Golf-style silver hatch at the perimeter.
parked[5].children[0].material.color.set(0xbdc8d1);
const golfLabel=null;
for(const [x,z] of [[8,12],[-25,-12]]){cube(1.4,.1,.8,slab,x,1.05,z);for(const dx of [-.5,.5])cube(.1,1,.1,concrete,x+dx,.5,z);}

  return {
    parked,
    people,
    golf: parked[5],
    golfLabel,
    markings,
    staticCount,
    person,
  };
}
