import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVehicleDrive, carOverlap, circleOverlap, polygonOverlap } from '../src/vehicles/vehicleDrive.js';
import { createVehicleRegistry } from '../src/vehicles/vehicleSeats.js';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createDriftSystem, driftPose } from '../src/vehicles/drift.js';
import { configureNightLighting } from '../src/core/lighting.js';

function setup() {
  const scene=new THREE.Scene(), {mat}=createMaterialSystem();
  const cars=createCarFactory(scene,mat);
  const parked=Array.from({length:19},(_,i)=>{const c=cars.car(0xff0000);c.position.set(-60+i*7,0,60);return c;});
  const registry=createVehicleRegistry(parked);
  const drift=createDriftSystem(scene,cars,{makeSmokeTexture:()=>new THREE.Texture()});
  const obstacles=[];
  const drive=createVehicleDrive({golf:parked[5],parked,people:[],visitors:[],drifters:[],drift,
    camera:new THREE.PerspectiveCamera(),controls:{target:new THREE.Vector3(),update(){}},
    isDriveable:(x,z)=>Math.abs(x)<150 && Math.abs(z)<150,staticObstacles:obstacles});
  return {scene,parked,registry,drive,drift,obstacles};
}

test('selected SUV footprint, height and yaw reach beyond Golf collision bounds',()=>{
  const f=setup(), car=f.parked[16];
  car.userData.footprint={halfLength:2.56,halfWidth:1.132,height:1.919};
  f.drive.startVehicle(f.registry.vehicles[16]);
  assert.equal(f.drive.blocked(new THREE.Vector3(147.6,0,0),0),true,'Full SUV must stay on land');
  assert.equal(f.drive.blocked(new THREE.Vector3(147,0,0),0),false);
  assert.equal(f.drive.blocked(new THREE.Vector3(0,0,147.6),Math.PI/2),true);
  f.obstacles.push({minX:2.4,maxX:2.5,minZ:-3,maxZ:3,minY:1.8,maxY:2,
    outline:[[2.4,-3],[2.5,-3],[2.5,3],[2.4,3]]});
  assert.equal(f.drive.blocked(new THREE.Vector3(),0),true,'SUV roof hits raised obstacle');
  f.obstacles[0].minY=0;f.obstacles[0].maxY=2;
  assert.equal(f.drive.blocked(new THREE.Vector3(),0),true,'Fence blocks front bumper');
  f.obstacles.length=0;
  const other=f.parked[0];other.position.set(4.4,0,0);
  assert.equal(f.drive.blocked(new THREE.Vector3(),0),true,'Other car blocks SUV nose');
  assert.equal(carOverlap(new THREE.Vector3(),0,other),false,'Fixture is beyond compact nose');
  assert(circleOverlap(new THREE.Vector3(),0,2.7,0,.2,car.userData.footprint));
  assert(polygonOverlap(new THREE.Vector3(),0,[[2.4,-1],[2.5,-1],[2.5,1],[2.4,1]],car.userData.footprint));
});

test('handbrake smoke and skids use selected car rear axle, bounded shared pools',()=>{
  const f=setup(), car=f.parked[17];car.position.set(0,0,0);car.userData.footprint={halfLength:2.4327,halfWidth:1.0763};
  f.drive.startVehicle(f.registry.vehicles[17]);f.drive.setKey('KeyW',true);
  for(let i=0;i<70;i++)f.drive.updateDriving(1/60);
  f.drive.setKey('KeyW',false);f.drive.setKey('Space',true);f.drive.setKey('KeyA',true);
  for(let i=0;i<20;i++)f.drive.updateDriving(1/60);
  assert(Math.abs(f.drive.state.slip)>.05);assert(f.drift.skidCount>0);
  assert(f.drift.smokePool.some(p=>p.o.visible));
  const rear=f.drift.rearPoints(car).map(p=>car.worldToLocal(p.clone()));
  assert(Math.abs(rear[0].x+2.4327*1.13/1.96)<1e-9);
  assert(Math.abs(rear[0].z+1.0763*.88/1.04)<1e-9);
  assert.equal(f.drift.smokePool.length,90);assert.equal(f.drift.skidCapacity,4000);
});

test('one night projector transfers between roots and survives visual children replacement',()=>{
  const f=setup();let selected=f.parked[5];
  const update=configureNightLighting(f.scene,{arenaX:50,headlightCars:[{get car(){return selected;},isActive:()=>true,projector:true}]});
  const entry=f.scene.userData.headlights[0], light=entry.light, beam=entry.beam;
  selected=f.parked[17];selected.userData.footprint={halfLength:2.4327,halfWidth:1.0763};update();
  assert.equal(light.parent,selected);assert.equal(beam.parent,selected);assert(light.intensity>0);
  selected.clear();update();assert.equal(light.parent,selected);assert.equal(beam.parent,selected);
  assert.equal(entry.light,light);assert.equal(entry.beam,beam);assert(Math.abs(light.position.x-2.3727)<1e-9);
  update(true);assert.equal(light.intensity,0);assert.equal(beam.visible,false);
});

test('automatic drifters yield to any relocated parked vehicle without a Golf flag',()=>{
  const f=setup(), p=driftPose(.3,0), car=f.parked[16];
  car.position.set(p.x,0,p.z);car.rotation.y=p.angle;
  f.drift.update(0,{obstacles:[car]});assert.equal(f.drift.driftWaiting,true);
});

test('Golf, RX, GL, GLA and procedural physics stop at fences, other cars and water under held throttle',()=>{
  for(const index of [0,2,5,16,17,18])for(const obstacle of ['fence','car','water']) {
    const f=setup(), car=f.parked[index];
    const halfLength=index===16?2.56:index===17?2.4327:index===2?2.1375:index===18?2.210951:1.96;
    car.userData.footprint={halfLength,halfWidth:1.132};
    // Fixture sets the starting line; all subsequent motion is the live controller.
    car.position.set(obstacle==='water'?140:0,0,0);car.rotation.y=0;
    if(obstacle==='fence')f.obstacles.push({minX:5,maxX:5.05,minZ:-5,maxZ:5,minY:0,maxY:3,
      outline:[[5,-5],[5.05,-5],[5.05,5],[5,5]]});
    if(obstacle==='car') {const other=f.parked[index===0?1:0];other.position.set(7,0,0);}
    f.drive.startVehicle(f.registry.vehicles[index]);f.drive.setKey('KeyW',true);
    for(let step=0;step<600;step++)f.drive.updateDriving(1/60);
    assert.equal(f.drive.state.speed,0,`${index}/${obstacle} stops`);
    assert(car.position.x>(obstacle==='water'?141:.5),'Input actually moves vehicle');
    assert(car.position.x+halfLength<(obstacle==='water'?150:obstacle==='fence'?5:7-1.96),`${index}/${obstacle} no tunnelling`);
  }
});
