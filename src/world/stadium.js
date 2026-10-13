import * as THREE from 'three';
import { createPrimitives } from '../utils/primitives.js';
import { surfaceSign } from '../utils/signs.js';
import { createClosedArenaRoof } from './arenaRoof.js';

/**
 * The low-poly Gazprom Arena, based on the migrated legacy architecture.
 * Stage 6.1 refines the closed roof leaves; the foundation, fixed roof,
 * facade, masts and site placement retain the accepted dimensions.
 *
 * Note: stadium meshes are children of the translated stadium group;
 * structural stays, roof seams, galleries and signs are added to the scene
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
  arenaX = 41,
  { makeSurfaceSign = surfaceSign } = {},
) {
  const { cube, cyl, line } = createPrimitives(scene);
  const { concrete, slab, white } = materials;
  const surfaceSign = makeSurfaceSign;

// Gazprom Arena: proportions and features based on official ground photos and aerial references.
const stadium=new THREE.Group();stadium.position.set(arenaX,0,0);scene.add(stadium);
function arenaMesh(geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;stadium.add(m);return m;}
const steel=mat(0xc5cbc9,{metalness:.3,roughness:.55}),shellMat=mat(0xb1b1a9,{metalness:.12,roughness:.72}),facade=mat(0x345063,{metalness:.5,roughness:.27}),cyan=mat(0x7bdaed,{emissive:0x188bab,emissiveIntensity:.45}),darkGlass=mat(0x1b2d38,{metalness:.25,roughness:.35}),warmWindow=mat(0x7a8989,{emissive:0x6b6544,emissiveIntensity:.28});
// Raised podium and the open column-supported lower tier.
arenaMesh(new THREE.CylinderGeometry(23.6,24.6,1.8,80),concrete,0,.85);
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
// Eight masts lean inward, with stays ending on the fixed roof.
for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8,base=[arenaX+23.5*Math.cos(a),5.1,23.5*Math.sin(a)],top=[arenaX+17.7*Math.cos(a),23.0,17.7*Math.sin(a)];line(base,top,steel,.20);for(const da of [-.22,.22]){const p=roofPoint(a+da,.83);line(top,[arenaX+p.x,p.y,p.z],steel,.045);}cyl(.095,.095,.18,mat(0xff4444,{emissive:0xff1200,emissiveIntensity:.6}),top[0],top[1]+.1,top[2],6);}
// Entrance stairs, terrace lawns and roofed parking galleries around the podium.
for(let i=0;i<16;i++){const a=i*Math.PI/8;for(let j=0;j<7;j++){const r=25+j*.48;const step=cube(2.9,.18,.52,concrete,arenaX+r*Math.cos(a),1.7-j*.24,r*Math.sin(a),Math.PI/2-a);}
 if(i!==8){const r=28.5,patch=cube(3.4,.12,3.2,mat(0x547354),arenaX+r*Math.cos(a+.09),.05,r*Math.sin(a+.09),Math.PI/2-a);}
}
for(let i=0;i<12;i++){const a=i*Math.PI/6;if(Math.cos(a)<-.62)continue;const r=30.3,x=arenaX+r*Math.cos(a),z=r*Math.sin(a),yaw=Math.PI/2-a;cube(6.6,.32,4.7,concrete,x,1.9,z,yaw);cube(6.3,.18,4.4,slab,x,-.04,z,yaw);for(const dx of [-2.6,0,2.6]){const xx=x+dx*Math.sin(a),zz=z-dx*Math.cos(a);cube(.16,1.8,.16,steel,xx,.9,zz);}for(let k=-2;k<=2;k++)cube(.08,.02,3.4,white,x+k*Math.sin(a),2.075,z-k*Math.cos(a),yaw);}
// Facade name follows the western face, visible from the car-meet area.
const arenaSign=surfaceSign('ГАЗПРОМ АРЕНА',0xe9faff,0x244558,13,1.1);arenaSign.position.set(arenaX-24.3,10.2,0);arenaSign.rotation.y=-Math.PI/2;scene.add(arenaSign);


  return {
    stadium,
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
