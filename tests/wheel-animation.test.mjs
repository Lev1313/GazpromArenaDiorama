import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createMaterialSystem } from '../src/materials/materials.js';
import { advanceWheels, steerWheels, prepareWheelBounds, installImportedWheels } from '../src/vehicles/wheelAnimation.js';
import { createVehicleDrive } from '../src/vehicles/vehicleDrive.js';

const definitions=[['golf6_red_v2',0,Math.PI/2],['lexus_rx_deep_blue_mica',-Math.PI/2,Math.PI],['mercedes_gl_x166_obsidian_black',0,-Math.PI/2]];
async function model(name) {
  const data=fs.readFileSync(new URL('../public/models/cars/'+name+'.glb',import.meta.url));
  const loader=new GLTFLoader();loader.register(p=>{p.loadTexture=async()=>new T.Texture();return {name:'unit-no-image-decode'};});
  return loader.parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
}
function raw(name) {
  const b=fs.readFileSync(new URL('../public/models/cars/'+name+'.glb',import.meta.url)),n=b.readUInt32LE(12);
  return {json:JSON.parse(b.subarray(20,20+n).toString()),bin:b.subarray(28+n),bytes:b};
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function accessorBytes(asset,index) {
  const a=asset.json.accessors[index],v=asset.json.bufferViews[a.bufferView];
  return asset.bin.subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+v.byteLength);
}

test('procedural rigs expose four independent steering/rolling pivots, radius and physical axes',()=>{
  const scene=new T.Scene(),{mat}=createMaterialSystem(),car=createCarFactory(scene,mat).car(0xff0000);
  assert.equal(car.userData.wheels.length,4);assert.equal(car.userData.frontWheels.length,2);
  advanceWheels(car,.8,.3);
  for(const wheel of car.userData.wheels) {
    assert.equal(wheel.radius,.4);assert.equal(wheel.angle,2);assert.equal(wheel.distance,.8);
    assert.equal(wheel.steeringPivot.rotation.y,wheel.front?.3:0);
    assert.equal(wheel.rollingPivot.parent,wheel.steeringPivot);
    assert(wheel.rollingPivot.children.length===2);
    assert(Math.abs(wheel.rollingPivot.rotation.z+2)<1e-12);
  }
  const rear=car.userData.wheels.filter(w=>!w.front).map(w=>w.angle);
  advanceWheels(car,.4,-.2,{handbrake:true});
  assert.deepEqual(car.userData.wheels.filter(w=>!w.front).map(w=>w.angle),rear);
  for(const w of car.userData.wheels.filter(w=>w.front))assert(Math.abs(w.angle-3)<1e-12);
  advanceWheels(car,-.4,0);for(const w of car.userData.wheels)assert.equal(w.angle,w.front?2:1);
  const angles=car.userData.wheels.map(w=>w.angle);advanceWheels(car,0,.5);steerWheels(car,0);
  assert.deepEqual(car.userData.wheels.map(w=>w.angle),angles,'Stationary steering and exit do not spin/reset tires');
});

for(const [name,rx,ry] of definitions) {
  test(name+': lossless derivative preserves materials, images, attributes and every indexed triangle',()=>{
    const original=raw(name),derived=raw(name+'_wheels');
    assert.equal(derived.json.asset.extras.wheelPartition.sha256,sha(original.bytes));
    assert.deepEqual(derived.json.materials,original.json.materials);
    assert.deepEqual(derived.json.textures,original.json.textures);
    for(let i=0;i<(original.json.images??[]).length;i++) {
      const image=(a,n)=>{const v=a.json.bufferViews[a.json.images[n].bufferView];return a.bin.subarray(v.byteOffset,v.byteOffset+v.byteLength);};
      assert.equal(sha(image(original,i)),sha(image(derived,i)));
    }
    const signature=(asset,p)=>p.material+':'+Object.keys(p.attributes).map(k=>k+sha(accessorBytes(asset,p.attributes[k]))).join(':');
    const bags=new Map();
    function visit(asset,remove) {
      for(const m of asset.json.meshes)for(const p of m.primitives) {
        const key=signature(asset,p);if(!bags.has(key))bags.set(key,new Map());
        const bag=bags.get(key),a=asset.json.accessors[p.indices],bytes=accessorBytes(asset,p.indices);
        const read=i=>a.componentType===5123?bytes.readUInt16LE(i*2):bytes.readUInt32LE(i*4);
        for(let i=0;i<a.count;i+=3){const triangle=[read(i),read(i+1),read(i+2)].join(',');
          const count=(bag.get(triangle)??0)+(remove?-1:1);assert(count>=0,'No invented/duplicate triangle');
          if(count)bag.set(triangle,count);else bag.delete(triangle);
        }
      }
    }
    visit(original,false);visit(derived,true);for(const bag of bags.values())assert.equal(bag.size,0);
  });

  test(name+': four real wheels preserve rest geometry under arbitrary parent yaw and animate about their centers',async()=>{
    const gltf=await model(name+'_wheels'),modelRoot=gltf.scene;
    prepareWheelBounds(modelRoot);modelRoot.rotation.x=rx;
    const orientation=new T.Group();orientation.rotation.y=ry;orientation.add(modelRoot);orientation.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(orientation),center=box.getCenter(new T.Vector3());orientation.position.set(-center.x,-.12-box.min.y,-center.z);
    const car=new T.Group();car.position.set(13,.14,19);car.rotation.y=.713;car.add(orientation);car.updateWorldMatrix(true,true);
    const meshes=[];modelRoot.traverse(o=>{if(o.isMesh)meshes.push({mesh:o,matrix:o.matrixWorld.clone()});});
    const wheels=installImportedWheels(car,modelRoot);car.updateWorldMatrix(true,true);
    assert.equal(wheels.length,4);
    for(const {mesh,matrix} of meshes)for(let i=0;i<16;i++)assert(Math.abs(mesh.matrixWorld.elements[i]-matrix.elements[i])<1e-6,'Rest transform preserved');
    for(const w of wheels) {
      assert(w.radius>.3&&w.radius<.41);assert.equal(w.front,w.center.x>0);
      const origin=w.rollingPivot.getWorldPosition(new T.Vector3());advanceWheels(car,.05,.25);
      assert(origin.distanceTo(w.rollingPivot.getWorldPosition(new T.Vector3()))<1e-8,'Wheel center does not orbit');
    }
    const stationary=meshes.filter(r=>!r.mesh.userData.wheelPart);
    car.updateWorldMatrix(true,true);
    for(const {mesh,matrix} of stationary)for(let i=0;i<16;i++)assert(Math.abs(mesh.matrixWorld.elements[i]-matrix.elements[i])<1e-6,'Body never rotates with tires');
  });
}

test('drive animation uses accepted displacement: forward, reverse, blocked throttle, parked and stopped state',()=>{
  const scene=new T.Scene(),{mat}=createMaterialSystem(),car=createCarFactory(scene,mat).car(0xff0000);
  let wall=false;
  const drive=createVehicleDrive({golf:car,parked:[car],people:[],visitors:[],drifters:[],camera:new T.PerspectiveCamera(),
    controls:{target:new T.Vector3(),update(){}},isDriveable:()=>!wall,drift:{rearPoints:()=>[],smokeEnabled:false}});
  drive.setDriving(true);drive.setKey('KeyW',true);
  for(let i=0;i<30;i++)drive.updateDriving(1/60);
  const distance=car.position.x;for(const w of car.userData.wheels)assert(Math.abs(w.angle-distance/w.radius)<1e-9);
  wall=true;const angles=car.userData.wheels.map(w=>w.angle);drive.updateDriving(.06);
  assert.deepEqual(car.userData.wheels.map(w=>w.angle),angles,'Blocked wheels do not spin');
  wall=false;drive.clearKeys();drive.setKey('KeyS',true);
  for(let i=0;i<30;i++)drive.updateDriving(1/60);
  assert(car.userData.wheels.every((w,i)=>w.angle<angles[i]),'Reverse changes sign');
  drive.stopDriving();const stopped=car.userData.wheels.map(w=>w.angle);drive.updateDriving(.06);
  assert.deepEqual(car.userData.wheels.map(w=>w.angle),stopped,'Parked wheels retain angles');
});
