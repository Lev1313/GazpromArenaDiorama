import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';
import { surfaceSign } from '../utils/signs.js';
import { createClosedArenaRoof } from './arenaRoof.js';
import { createArenaBase } from './arenaBase.js';
import { arenaX as defaultArenaX } from './siteLayout.js';

/**
 * The low-poly Gazprom Arena, based on the migrated legacy architecture.
 * Stage 6.1 refines the roof leaves; 6.2 joins the podium and stairs.
 * Fixed roof, facade, masts and site placement retain accepted dimensions.
 *
 * Note: stadium meshes are children of the translated stadium group;
 * structural stays, roof seams and signs are added to the scene
 * exactly as in legacy. Grouping/rebatching is reserved for a later stage.
 *
 * @param {THREE.Scene} scene
 * @param {(color:number,extra?:Object)=>THREE.MeshStandardMaterial} mat
 * @param {ReturnType<import('../materials/materials.js').createBaseMaterials>} materials
 * @param {number} arenaX
 * @param {{ makeSurfaceSign?: typeof surfaceSign }} options
 */
export function createStadium(
  scene,
  mat,
  materials,
  arenaX = defaultArenaX,
  { makeSurfaceSign = surfaceSign } = {},
) {
  const { cube, cyl, line } = createPrimitives(scene);
  const { concrete } = materials;
  const surfaceSign = makeSurfaceSign;

// Gazprom Arena: proportions and features based on official ground photos and aerial references.
const stadium=new THREE.Group();stadium.position.set(arenaX,0,0);scene.add(stadium);
function arenaMesh(geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;stadium.add(m);return m;}
const steel=mat(0xc5cbc9,{metalness:.3,roughness:.55}),shellMat=mat(0xb1b1a9,{metalness:.12,roughness:.72}),facade=mat(0x345063,{metalness:.5,roughness:.27}),cyan=mat(0x7bdaed,{emissive:0x188bab,emissiveIntensity:.45}),darkGlass=mat(0x1b2d38,{metalness:.25,roughness:.35}),warmWindow=mat(0x7a8989,{emissive:0x6b6544,emissiveIntensity:.28});
// Raised podium and the open column-supported lower tier.
const base = createArenaBase(stadium, mat, concrete, steel);
arenaMesh(new THREE.CylinderGeometry(18.8,18.2,5.1,80),darkGlass,0,4.2);
for(let i=0;i<32;i++){const a=i*Math.PI/16;line([arenaX+21.5*Math.cos(a),1.8,21.5*Math.sin(a)],[arenaX+19.6*Math.cos(a),6.2,19.6*Math.sin(a)],steel,.24);}
// Broad inverted bowl: lower edge recedes towards the columns.
arenaMesh(new THREE.LatheGeometry([new THREE.Vector2(18.9,4.7),new THREE.Vector2(20.4,5.1),new THREE.Vector2(24.0,9.5),new THREE.Vector2(24.3,9.7),new THREE.Vector2(19.0,4.7)],80),shellMat);
const glazing=arenaMesh(new THREE.CylinderGeometry(24.15,23.9,1.35,96,1,true),facade,0,10.25);
for(let i=0;i<96;i++){const a=i*Math.PI/48;const rib=arenaMesh(new THREE.BoxGeometry(.075,1.35,.1),steel,24.18*Math.cos(a),10.25,24.18*Math.sin(a));rib.rotation.y=-a;}
for(const y of [9.68,10.05,10.45,10.82]){const ring=arenaMesh(new THREE.TorusGeometry(24.17,.055,4,96),steel,0,y);ring.rotation.x=Math.PI/2;}
// Small paired horizontal openings puncture the metal cladding.
for(let row=0;row<2;row++)for(let i=0;i<64;i++){const a=i*Math.PI/32+.02,r=row?22.3:20.55,y=row?7.47:5.48;const opening=arenaMesh(new THREE.BoxGeometry(.65,.25,.13),darkGlass,r*Math.cos(a),y,r*Math.sin(a));opening.rotation.y=Math.PI/2-a;}
for(let i=0;i<16;i++){const a=i*Math.PI/8;const e=arenaMesh(new THREE.BoxGeometry(2.9,3.7,.38),facade,19.2*Math.cos(a),3.7,19.2*Math.sin(a));e.rotation.y=Math.PI/2-a;for(const dx of [-.9,0,.9]){const col=arenaMesh(new THREE.BoxGeometry(.08,3.7,.45),steel,19.24*Math.cos(a)+dx*Math.sin(a),3.7,19.24*Math.sin(a)-dx*Math.cos(a));col.rotation.y=Math.PI/2-a;}}
function roofInner(a){const c=Math.cos(a),s=Math.sin(a);return [10.2*Math.sign(c)*Math.pow(Math.abs(c),.62),15.0*Math.sign(s)*Math.pow(Math.abs(s),.62)];}
function roofPoint(a,v){const inner=roofInner(a);return new THREE.Vector3(THREE.MathUtils.lerp(inner[0],26.6*Math.cos(a),v),13.5-2.2*Math.pow(v,1.35),THREE.MathUtils.lerp(inner[1],27.0*Math.sin(a),v));}
function arenaSurface(vertices,indices,material){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return arenaMesh(g,material);}
const roofVerts=[],roofIndices=[],roofN=96,roofRings=5;
for(let j=0;j<=roofRings;j++)for(let i=0;i<=roofN;i++)roofVerts.push(...roofPoint(i/roofN*Math.PI*2,j/roofRings).toArray());
for(let j=0;j<roofRings;j++)for(let i=0;i<roofN;i++){const k=j*(roofN+1)+i;roofIndices.push(k,k+1,k+roofN+1,k+1,k+roofN+2,k+roofN+1);}
const roof=arenaSurface(roofVerts,roofIndices,mat(0xbac2c4,{roughness:.6,metalness:.22,side:THREE.DoubleSide}));
// Fine roof panel seams, kept geometric for the low-poly style.
const seamMat=mat(0x7e8d94,{roughness:.7});
for(let i=0;i<32;i++){const a=i/32*Math.PI*2;for(let j=0;j<5;j++){const p=roofPoint(a,j/5),q=roofPoint(a,(j+1)/5);line([arenaX+p.x,p.y+.065,p.z],[arenaX+q.x,q.y+.065,q.z],seamMat,.026);}}
for(const v of [.4,.8,1])for(let i=0;i<96;i++){const p=roofPoint(i/96*Math.PI*2,v),q=roofPoint((i+1)/96*Math.PI*2,v);line([arenaX+p.x,p.y+.065,p.z],[arenaX+q.x,q.y+.065,q.z],v===1?steel:seamMat,v===1?.13:.026);}
// Two closed leaves with a reference-informed frame grid, at the legacy footprint.
const retractableRoof = createClosedArenaRoof(stadium, mat);
for(const y of [11.08,11.3]){const o=arenaMesh(new THREE.TorusGeometry(26.55,.11,5,96),y>11.1?cyan:steel,0,y);o.scale.y=27/26.55;o.rotation.x=Math.PI/2;}
// Trim the eight free lower mast ends at their intersection with the bowl.
// Keep the original line slope, tips and stays. The bowl expands from
// r=20.4 at y=5.1 to r=24 at y=9.5; the mast leans in toward r=17.7 at y=23.
const mastSlope = (23.5 - 17.7) / (23 - 5.1);
const mastJoinY = 5.1 + (23.5 - 20.4) / (mastSlope + (24 - 20.4) / (9.5 - 5.1));
const mastJoinR = 23.5 - mastSlope * (mastJoinY - 5.1);
for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8,base=[arenaX+mastJoinR*Math.cos(a),mastJoinY,mastJoinR*Math.sin(a)],top=[arenaX+17.7*Math.cos(a),23.0,17.7*Math.sin(a)];line(base,top,steel,.20);for(const da of [-.22,.22]){const p=roofPoint(a+da,.83);line(top,[arenaX+p.x,p.y,p.z],steel,.045);}cyl(.095,.095,.18,mat(0xff4444,{emissive:0xff1200,emissiveIntensity:.6}),top[0],top[1]+.1,top[2],6);}
// Terrace lawns stay inside the ring road; stairs are built with the podium.
for(let i=0;i<16;i++){const a=i*Math.PI/8;
 if(i!==8){const r=27,b=a+Math.PI/16;cube(3.4,.12,3.2,mat(0x547354),arenaX+r*Math.cos(b),.05,r*Math.sin(b),Math.PI/2-b);}
}
// Facade name follows the western face, visible from the car-meet area.
const arenaSign=surfaceSign('ГАЗПРОМ АРЕНА',0xe9faff,0x244558,13,1.1);arenaSign.position.set(arenaX-24.3,10.2,0);arenaSign.rotation.y=-Math.PI/2;scene.add(arenaSign);


  return {
    stadium,
    base,
    arenaSign,
    roof,
    retractableRoof,
    steel,
    shellMat,
    facade,
    cyan,
    darkGlass,
  };
}
