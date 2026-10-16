// Lossless topology partition: never cuts triangles or rewrites vertex/material/image data.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const configs=[
  {name:'golf6_red_v2',rx:0,ry:Math.PI/2,tire:'Gar_p1b',rolling:['Gar_p1b','golf6_silver_rims'],
    fixed:['mechanical_rally'],fixedComponentTriangles:124},
  {name:'lexus_rx_deep_blue_mica',rx:-Math.PI/2,ry:Math.PI,tire:'tire_mat4',
    rolling:['tire_mat4','silver','silver_d','black_matt','brakes1'],fixed:[]},
  {name:'mercedes_gl_x166_obsidian_black',rx:0,ry:-Math.PI/2,tire:'Tire',rolling:['Tire','Rims.001'],fixed:['EngineBay1Mtl']},
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const ids=['front-left','front-right','rear-left','rear-right'];
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
const reports=[];
for(const config of configs) {
  const path='public/models/cars/'+config.name+'.glb',source=fs.readFileSync(path);
  const jsonLength=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+jsonLength).toString());
  assert(!json.animations && !json.skins && !json.extensionsUsed,'Review nontrivial GLTF extensions before partitioning');
  const sourceBin=source.subarray(28+jsonLength,28+jsonLength+source.readUInt32LE(20+jsonLength));
  const loader=new GLTFLoader();loader.register(parser=>{parser.loadTexture=async()=>new T.Texture();return{name:'offline-no-image-decode'};});
  const gltf=await loader.parseAsync(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength),'');
  gltf.scene.rotation.x=config.rx;const root=new T.Group();root.rotation.y=config.ry;root.add(gltf.scene);root.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(root),centre=bounds.getCenter(new T.Vector3());
  root.position.set(-centre.x,-.12-bounds.min.y,-centre.z);root.updateMatrixWorld(true);
  const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push({mesh:o,association:gltf.parser.associations.get(o)});});
  const tires=meshes.filter(r=>r.mesh.material.name===config.tire).flatMap(r=>components(r.mesh));
  assert.equal(tires.length,4,'Exactly four disconnected tires required');
  const wheels=tires.map(c=>{
    const center=c.box.getCenter(new T.Vector3()),size=c.box.getSize(new T.Vector3());
    return {id:(center.x>0?'front':'rear')+'-'+(center.z<0?'left':'right'),center:center.toArray(),
      radius:(size.x+size.y)/4,min:c.box.min.toArray(),max:c.box.max.toArray()};
  }).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
  const added=[],parts=[],audit=[];let virtualOffset=sourceBin.length;
  for(const {mesh,association} of meshes) {
    const name=mesh.material.name;
    if(!config.rolling.includes(name)&&!config.fixed.includes(name))continue;
    const primitive=json.meshes[association.meshes].primitives[association.primitives],originalIndices=json.accessors[primitive.indices];
    const groups=new Map();
    for(const component of components(mesh)) {
      const box=component.box,center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
      const wheel=wheels.find(w=>box.min.x>=w.center[0]-w.radius-.008 && box.max.x<=w.center[0]+w.radius+.008
        && box.min.y>=w.center[1]-w.radius-.008 && box.max.y<=w.center[1]+w.radius+.008
        && box.min.z>=w.min[2]-.08 && box.max.z<=w.max[2]+.08);
      let key='body';
      if(wheel) {
        let fixed=config.fixed.includes(name);
        // RX silver_d contains the calipers plus separate valve stems; calipers steer without spinning.
        if(name==='silver_d' && size.y>.15)fixed=true;
        if(config.name.startsWith('lexus')&&name==='black_matt'&&size.x<.1
          && Math.hypot(center.x-wheel.center[0],center.y-wheel.center[1])>.08)fixed=true;
        key=wheel.id+(fixed?':fixed':':rolling');
        // Audited Golf calipers are four complete 124-triangle components; leave suspension/body parts alone.
        if(fixed&&config.fixedComponentTriangles&&component.indices.length/3!==config.fixedComponentTriangles)key='body';
      }
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...component.indices);
    }
    // Each triangle belongs to exactly one whole connected component/bucket.
    assert.equal([...groups.values()].reduce((sum,a)=>sum+a.length,0),mesh.geometry.index.count);
    const body=[];
    for(const [key,indices] of groups) {
      const values=originalIndices.componentType===5123?Uint16Array.from(indices):Uint32Array.from(indices),bytes=Buffer.from(values.buffer);
      virtualOffset=(virtualOffset+3)&~3;
      const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:virtualOffset,byteLength:bytes.length,target:34963});
      added.push({offset:virtualOffset,bytes});virtualOffset+=bytes.length;
      const accessor=json.accessors.length;json.accessors.push({bufferView:view,componentType:originalIndices.componentType,count:indices.length,type:'SCALAR'});
      const split={...primitive,attributes:{...primitive.attributes},indices:accessor};
      if(key==='body')body.push(split);
      else {
        const [id,behavior]=key.split(':'),index=json.meshes.length;
        json.meshes.push({name:mesh.name+'-'+key,primitives:[split]});
        const node=json.nodes.length;
        json.nodes.push({name:mesh.name+'-'+key,mesh:index,extras:{wheelPart:id,wheelBehavior:behavior,wheelTire:name===config.tire}});
        const original=json.nodes[association.nodes];original.children??=[];original.children.push(node);
        parts.push({id,behavior,material:name,triangles:indices.length/3});
      }
      audit.push({material:name,bucket:key,triangles:indices.length/3});
    }
    json.meshes[association.meshes].primitives=body;
  }
  // Remove empty source meshes and unused original index buffers; retain all referenced data verbatim.
  const meshMap=new Map(),kept=[];json.meshes.forEach((m,i)=>{if(m.primitives.length){meshMap.set(i,kept.length);kept.push(m);}});json.meshes=kept;
  for(const node of json.nodes)if(node.mesh!==undefined){if(meshMap.has(node.mesh))node.mesh=meshMap.get(node.mesh);else delete node.mesh;}
  const used=new Set();for(const m of json.meshes)for(const p of m.primitives){used.add(p.indices);Object.values(p.attributes).forEach(a=>used.add(a));}
  const accessorMap=new Map();json.accessors=json.accessors.filter((a,i)=>{if(!used.has(i))return false;accessorMap.set(i,accessorMap.size);return true;});
  for(const m of json.meshes)for(const p of m.primitives){p.indices=accessorMap.get(p.indices);for(const k in p.attributes)p.attributes[k]=accessorMap.get(p.attributes[k]);}
  const combined=Buffer.alloc(virtualOffset);sourceBin.copy(combined);for(const a of added)a.bytes.copy(combined,a.offset);
  const usedViews=new Set(json.accessors.map(a=>a.bufferView));for(const image of json.images??[])if(image.bufferView!==undefined)usedViews.add(image.bufferView);
  const viewMap=new Map(),chunks=[];let offset=0;
  json.bufferViews=json.bufferViews.filter((view,i)=>{if(!usedViews.has(i))return false;viewMap.set(i,viewMap.size);offset=(offset+3)&~3;
    const bytes=combined.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);chunks.push({offset,bytes});view.byteOffset=offset;offset+=bytes.length;return true;});
  for(const a of json.accessors)a.bufferView=viewMap.get(a.bufferView);for(const image of json.images??[])if(image.bufferView!==undefined)image.bufferView=viewMap.get(image.bufferView);
  const packed=Buffer.alloc(offset);for(const chunk of chunks)chunk.bytes.copy(packed,chunk.offset);json.buffers=[{byteLength:offset}];
  json.asset.extras={...json.asset.extras,wheelPartition:{version:1,source:config.name+'.glb',sha256:sha(source),wheels}};
  const output=writeGLB(json,packed),destination='public/models/cars/'+config.name+'_wheels.glb';fs.writeFileSync(destination,output);
  assert.deepEqual(json.materials,gltf.parser.json.materials);
  reports.push({source:path,sourceSHA256:sha(source),sourceBytes:source.length,derived:destination,derivedBytes:output.length,
    wheels,parts,audit,materials:json.materials.length,sourceTriangles:meshes.reduce((n,r)=>n+r.mesh.geometry.index.count/3,0),
    derivedTriangles:json.meshes.reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+json.accessors[p.indices].count/3,0),0)});
  console.log(config.name,source.length,'->',output.length,parts.length,'wheel material parts');
}
fs.mkdirSync('browser-tests/_current/wheels',{recursive:true});fs.writeFileSync('browser-tests/_current/wheels/model-audit.json',JSON.stringify(reports,null,2));
