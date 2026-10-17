import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Box3, Group, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareWheelBounds, installImportedWheels, advanceWheels } from '../src/vehicles/wheelAnimation.js';
import { createVehicleRegistry } from '../src/vehicles/vehicleSeats.js';
import { vehicleTuning } from '../src/vehicles/vehicleTuning.js';

test('GLA derivative preserves source triangle count, credits and distinct material roles', async () => {
  const bytes = fs.readFileSync('public/models/cars/mercedes_gla_x156_black_wheels.glb');
  const loader = new GLTFLoader();
  loader.register(p => { p.loadTexture = async () => new Texture(); return { name: 'offline' }; });
  const { scene, parser } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const json = parser.json;
  assert.equal(json.meshes.reduce((n,m) => n + json.accessors[m.primitives[0].indices].count / 3, 0), 176140);
  assert.equal(json.meshes.length, 14);
  assert.equal(json.materials.length, 5);
  assert(json.asset.extras.author.includes('ItsDiyor'));
  assert(json.asset.extras.license.includes('CC-BY-4.0'));
  assert.deepEqual(json.materials.find(m=>m.name==='Paint_Color').pbrMetallicRoughness.baseColorFactor, [.025,.03,.038,1]);
  assert.equal(json.materials.find(m=>m.name==='Index_0_2').alphaMode, 'BLEND');
  assert(json.meshes.every(m => Object.keys(m.primitives[0].attributes).filter(k=>k.startsWith('TEXCOORD')).length===1));
  prepareWheelBounds(scene);
  scene.rotation.y=Math.PI/2;
  scene.updateMatrixWorld(true);
  const box=new Box3().setFromObject(scene),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
  assert(Math.abs(size.x-4.421901)<1e-5);
  assert(Math.abs(size.z-2.015698)<1e-5);
  assert(Math.abs(size.y-1.557959)<1e-5);
  scene.position.set(-center.x,-.12-box.min.y,-center.z);
  const car=new Group();car.rotation.y=.7;car.add(scene);
  const wheels=installImportedWheels(car,scene);
  assert.equal(wheels.length,4);
  const fixed=wheels.map(w=>w.steeringPivot.children.find(c=>c.userData.wheelBehavior==='fixed'));
  assert(fixed.every(Boolean));
  const rest=fixed.map(p=>p.matrix.clone());
  advanceWheels(car,2,.3);
  for(const [i,w] of wheels.entries()) {
    assert(Math.abs(w.radius-.35092)<1e-5);
    assert(Math.abs(w.angle-2/w.radius)<1e-10);
    assert.equal(w.steeringPivot.rotation.y,w.front?.3:0);
    assert(fixed[i].matrix.equals(rest[i]),'Caliper local transform must never roll');
    assert.notEqual(w.rollingPivot.quaternion.z,0);
  }
  const prior=wheels.map(w=>w.angle);advanceWheels(car,.5,0,{handbrake:true});
  wheels.forEach((w,i)=>assert(w.front?w.angle>prior[i]:w.angle===prior[i]));
});

test('nineteenth GLA has its own calibrated four seats and arcade configuration', () => {
  const cars=Array.from({length:19},()=>new Group()),registry=createVehicleRegistry(cars);
  const gla=registry.get('parked-mercedes-gla-x156');
  gla.car.userData.footprint={halfLength:2.210951,halfWidth:1.007849,height:1.557959};
  registry.refresh(gla);
  assert.equal(gla.index,18);assert.equal(gla.seats.length,4);
  assert.equal(gla.displayName,'Mercedes-Benz GLA X156');
  assert.equal(gla.seats.filter(s=>s.role==='driver').length,1);
  assert(gla.seats.every(s=>s.localPosition.y===-.2&&Math.abs(s.entryPoint.z)>1.65));
  assert.equal(vehicleTuning(gla.vehicleId).wheelbase,2.7);
  assert.notEqual(registry.get('parked-mercedes-gl').car,gla.car);
});
