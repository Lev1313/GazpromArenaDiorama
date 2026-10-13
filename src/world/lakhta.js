import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';

/**
 * Lakhta Center and the two neighboring low buildings, copied from the
 * original diorama, with outward-facing facade triangles.
 * @param {THREE.Scene} scene
 * @param {Function} mat
 * @param {Object} materials
 * @param {THREE.Material} steel
 */
export function createLakhta(scene, mat, materials, steel) {
  const { cube, line } = createPrimitives(scene);
  const { glass } = materials;

// Lakhta: five twisting wings widen above the base and taper continuously into the spire.
const towerMats=[0x7ea8ba,0x598196,0x8eb3c0,0x426c84,0x6994a9].map(color=>mat(color,{metalness:.55,roughness:.32}));
function towerVertex(level,side){const u=level/32,h=u*72,r=(4.4+1.6*Math.sin(Math.PI*u))*(1-Math.pow(u,1.55))+.03,a=side/5*Math.PI*2+u*Math.PI/2;return new THREE.Vector3(-62+r*Math.cos(a),h,-102+r*Math.sin(a));}
for(let side=0;side<5;side++){const vertices=[],indices=[];for(let level=0;level<=32;level++)for(const s of [side,side+1])vertices.push(...towerVertex(level,s).toArray());for(let level=0;level<32;level++){const k=level*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();const m=new THREE.Mesh(geo,towerMats[side]);m.castShadow=true;scene.add(m);for(let level=0;level<32;level++){line(towerVertex(level,side).toArray(),towerVertex(level+1,side).toArray(),steel,.045);line(towerVertex(level,side).toArray(),towerVertex(level,side+1).toArray(),mat(0x9abac4),.025);}}
for(const [x,z,w,d] of [[-46,-106,20,10],[-71,-113,17,8]]){cube(w,3,d,glass,x,1,z);const roof=cube(w+1,.35,d+1,steel,x,2.65,z);roof.rotation.z=.1;for(let i=0;i<5;i++)cube(.08,3,d+.1,steel,x-w/2+i*w/4,1,z);}

  return { towerMats, towerVertex };
}
