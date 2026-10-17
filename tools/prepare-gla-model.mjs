// Offline GLA X156 preparation; original ZIP and existing GLBs are never modified.
import fs from 'node:fs';
import * as T from 'three';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
function components(mesh) {
  const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
  assert(ix,'Indexed source expected');
  const parent=Int32Array.from({length:p.count},(_,i)=>i),weld=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  // Welding is used for classification only; source vertices/normals/UV seams remain untouched.
  for(let i=0;i<p.count;i++) {
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
    if(weld.has(key))parent[find(i)]=find(weld.get(key));else weld.set(key,i);
  }
  for(let i=0;i<ix.count;i+=3){const a=find(ix.getX(i));parent[find(ix.getX(i+1))]=a;parent[find(ix.getX(i+2))]=a;}
  const groups=new Map(),v=new T.Vector3();
  for(let i=0;i<ix.count;i+=3) {
    const key=find(ix.getX(i));let c=groups.get(key);
    if(!c){c={indices:[],box:new T.Box3()};groups.set(key,c);}
    for(let j=0;j<3;j++){const n=ix.getX(i+j);c.indices.push(n);c.box.expandByPoint(v.fromBufferAttribute(p,n).applyMatrix4(mesh.matrixWorld));}
  }
  return [...groups.values()];
}
function writeGLB(json,bin) {
  const text=Buffer.from(JSON.stringify(json)),jn=(text.length+3)&~3,bn=(bin.length+3)&~3;
  const out=Buffer.alloc(12+8+jn+8+bn);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(jn,12);out.writeUInt32LE(0x4e4f534a,16);out.fill(32,20,20+jn);text.copy(out,20);
  out.writeUInt32LE(bn,20+jn);out.writeUInt32LE(0x004e4942,24+jn);bin.copy(out,28+jn);return out;
}

globalThis.ProgressEvent ??= class {constructor(type,init){Object.assign(this,init);}};

// Extract the licensed ZIP to this directory, then run prepare-gla-textures.ps1.
// Optional argument: extracted source directory. Existing Golf/RX/GL assets are untouched.
const sourceDir=(process.argv[2]??'browser-tests/_current/gla-source').replace(/\/$/,'')+'/';
const json=JSON.parse(fs.readFileSync(sourceDir+'scene.gltf'));
const originalBin=fs.readFileSync(sourceDir+'scene.bin');
json.buffers[0].uri='data:application/octet-stream;base64,'+originalBin.toString('base64');
const loader=new GLTFLoader();loader.register(p=>{p.loadTexture=async()=>new T.Texture();return {name:'offline'};});
const gltf=await loader.parseAsync(JSON.stringify(json),'');
const root=new T.Group();root.rotation.y=Math.PI/2;root.add(gltf.scene);root.updateMatrixWorld(true);
const meshes=[];root.traverse(mesh=>{if(mesh.isMesh)meshes.push({mesh,association:gltf.parser.associations.get(mesh)});});
const atlas=meshes.find(r=>r.mesh.name==='Object_5');
const tires=components(atlas.mesh).filter(c=>c.indices.length===2400 && c.box.getSize(new T.Vector3()).x>.69);
assert.equal(tires.length,4);
const wheels=tires.map(c=>{const center=c.box.getCenter(new T.Vector3()),size=c.box.getSize(new T.Vector3());return {
 id:(center.x>0?'front':'rear')+'-'+(center.z<0?'left':'right'),center:center.toArray(),radius:(size.x+size.y)/4,min:c.box.min.toArray(),max:c.box.max.toArray()};});
const output=structuredClone(json);output.accessors=[];output.bufferViews=[];output.meshes=[];
for(const n of output.nodes)delete n.mesh;
const chunks=[];let offset=0;
function buffer(bytes,target){offset=(offset+3)&~3;const id=output.bufferViews.length;output.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(target?{target}:{})});chunks.push({offset,bytes});offset+=bytes.length;return id;}
const audit=[];
for(const {mesh,association} of meshes){
 const groups=new Map();
 for(const c of components(mesh)){
  const center=c.box.getCenter(new T.Vector3()),size=c.box.getSize(new T.Vector3());
  const wheel=mesh===atlas.mesh&&wheels.find(w=>c.box.min.x>=w.min[0]-.003&&c.box.max.x<=w.max[0]+.003
   && c.box.min.y>=w.min[1]-.003&&c.box.max.y<=w.max[1]+.003&&c.box.min.z>=w.min[2]-.025&&c.box.max.z<=w.max[2]+.025);
  // Audited three-component caliper assemblies are offset from axle, unlike rims/rotors.
  const fixed=wheel&&size.x<.12&&size.y>.09&&Math.abs(center.x-wheel.center[0])>.08;
  const key=wheel?wheel.id+':'+(fixed?'fixed':'rolling'):'body';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...c.indices);
  audit.push({mesh:mesh.name,bucket:key,triangles:c.indices.length/3,center:center.toArray(),size:size.toArray()});
 }
 for(const [key,indices] of groups){
  const unique=[...new Set(indices)],map=new Map(unique.map((v,i)=>[v,i])),attributes={};
  let uv0;
  for(const [name,index] of Object.entries(json.meshes[association.meshes].primitives[association.primitives].attributes)){
   const src=json.accessors[index],view=json.bufferViews[src.bufferView];assert(!src.sparse);
   const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[src.type],bytesPer={5126:4,5123:2,5125:4,5121:1}[src.componentType]*count;
   const data=Buffer.alloc(unique.length*bytesPer);
   unique.forEach((v,i)=>originalBin.copy(data,i*bytesPer,(view.byteOffset??0)+(src.byteOffset??0)+v*(view.byteStride??bytesPer),(view.byteOffset??0)+(src.byteOffset??0)+v*(view.byteStride??bytesPer)+bytesPer));
   // All five source UV channels are byte-identical. Keep one, proven per bucket.
   if(name==='TEXCOORD_0')uv0=data;
   else if(name.startsWith('TEXCOORD_')){assert(data.equals(uv0),'Different UV channel requires review');continue;}
   const a={...src,bufferView:buffer(data,34962),byteOffset:0,count:unique.length};delete a.min;delete a.max;
   if(name==='POSITION'){a.min=[0,1,2].map(k=>Math.min(...unique.map(v=>mesh.geometry.attributes.position.array[v*3+k])));a.max=[0,1,2].map(k=>Math.max(...unique.map(v=>mesh.geometry.attributes.position.array[v*3+k])));}
   attributes[name]=output.accessors.length;output.accessors.push(a);
  }
  const values=unique.length<65536?Uint16Array.from(indices,i=>map.get(i)):Uint32Array.from(indices,i=>map.get(i));
  const ix=output.accessors.length;output.accessors.push({bufferView:buffer(Buffer.from(values.buffer),34963),componentType:values.BYTES_PER_ELEMENT===2?5123:5125,count:indices.length,type:'SCALAR'});
  const meshId=output.meshes.length;output.meshes.push({name:mesh.name+'-'+key,primitives:[{attributes,indices:ix,material:json.meshes[association.meshes].primitives[association.primitives].material}]});
  const [id,behavior]=key.split(':');const node=output.nodes.length;
  output.nodes.push({name:mesh.name+'-'+key,mesh:meshId,...(behavior?{extras:{wheelPart:id,wheelBehavior:behavior,wheelTire:behavior==='rolling'}}:{})});
  output.nodes[association.nodes].children??=[];output.nodes[association.nodes].children.push(node);
 }
}
for(const im of output.images){const file=im.uri.split('/').pop().replace(/\.[^.]+$/,'.png');im.bufferView=buffer(fs.readFileSync(sourceDir+'optimized/'+file));im.mimeType='image/png';delete im.uri;}
function sharedUV(value){if(!value||typeof value!=='object')return;for(const [k,v] of Object.entries(value)){if(k==='texCoord')value[k]=0;else sharedUV(v);}}
sharedUV(output.materials);
// Only paint changes. Atlas glass/chrome/rubber/lights remain untouched.
const paint=output.materials.find(m=>m.name==='Paint_Color').pbrMetallicRoughness;
paint.baseColorFactor=[.025,.03,.038,1];paint.metallicFactor=.3;paint.roughnessFactor=.28;
delete paint.metallicRoughnessTexture;
output.asset.extras={...output.asset.extras,title:'Mercedes-Benz GLA X156 - black',preparation:{version:1,sourceGeneration:'X156 (visual audit)',wheels,textureMaxSize:1024,sourceTriangles:176140}};
output.buffers=[{byteLength:offset}];const bin=Buffer.alloc(offset);for(const c of chunks)c.bytes.copy(bin,c.offset);
const result=writeGLB(output,bin);fs.writeFileSync('public/models/cars/mercedes_gla_x156_black_wheels.glb',result);
const triangles=output.meshes.reduce((n,m)=>n+output.accessors[m.primitives[0].indices].count/3,0);assert.equal(triangles,176140);
for(const w of wheels){assert.equal(audit.filter(c=>c.bucket===w.id+':fixed').length,3);assert(audit.some(c=>c.bucket===w.id+':rolling'));}
const report={bytes:result.length,triangles,meshes:output.meshes.length,materials:output.materials.length,wheels,audit};
fs.writeFileSync(sourceDir+'prepared-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,audit:undefined},null,2));
