import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createDriftSystem, driftPose } from '../src/vehicles/drift.js';
import { carOverlap, pointInLot } from '../src/vehicles/golfDrive.js';
import { parkingOutline } from '../src/world/terrain.js';

function makeDrift() {
  const scene = new THREE.Scene();
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  stopSharingStaticMaterials();
  const factory = createCarFactory(scene, mat);
  const system = createDriftSystem(scene, factory, {
    makeSmokeTexture: () => new THREE.Texture(),
  });
  return { scene, system };
}

test('drift poses follow velocity with varying radius, slip, speed and countersteer', () => {
  const slips=[],speeds=[];
  for(const phase of [0,2.4])for(let t=0;t<60;t+=.05){
    const p=driftPose(t,phase),q=driftPose(t+.001,phase);
    const heading=-Math.atan2(q.z-p.z,q.x-p.x);
    assert.ok(Math.cos(p.angle-heading)>.7,'Car keeps moving forward while sliding');
    assert.ok(Math.abs(Math.atan2(Math.sin(p.travelAngle-heading),Math.cos(p.travelAngle-heading)))<.004);
    assert.ok(Math.abs(p.wheelAngle)<=.55);
    if(Math.abs(p.slip)>.3)assert.ok(p.wheelAngle*p.slip<0,'Countersteer opposes body slip');
    slips.push(Math.abs(p.slip));speeds.push(p.speed);
  }
  assert.ok(Math.min(...slips)<.02&&Math.max(...slips)>.6);
  assert.ok(Math.max(...speeds)-Math.min(...speeds)>4);
  const lap=2*Math.PI/.41,p=driftPose(0,0),q=driftPose(lap,0);
  assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>.1,'Next lap changes shape');
});

test('two sporting drifters, smoke sprites and three existing tire rings', () => {
  const { scene, system } = makeDrift();
  assert.equal(system.drifters.length, 2);
  assert.deepEqual(system.drifters.map(c => c.phase), [0, 2.4]);
  assert.equal(system.smokePool.length, 90);
  assert.equal(system.prelaidTracks.length, 3);
  assert.equal(scene.children.length, 96);
  assert.equal(scene.children.filter(o => o.isGroup).length, 2);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  assert.ok(system.smokePool.every(p => p.o.material.depthWrite === false));
  assert.ok(system.smokePool.every(p => p.o.material.transparent));

  const first = driftPose(0, 0);
  assert.deepEqual(
    system.drifters[0].o.position.toArray(),
    [first.x, 0, first.z],
  );
  assert.equal(system.drifters[0].o.rotation.y, first.angle);
  assert.equal(system.skidCapacity, 4000);
  assert.equal(system.skidPositions.length, 24000);
  assert.equal(system.skidGeometry.drawRange.count, 0);
  assert.equal(system.skidLines.frustumCulled, false);
  assert.equal(system.prelaidTracks[0].geometry.attributes.position.count, 129);
});

test('drifting creates bounded skid segments and smoke without growing mesh counts', () => {
  const { scene, system } = makeDrift();
  system.update(.08);
  assert.equal(system.skidCount, 0); // Legacy first update stores the rear-wheel locations.
  assert.equal(system.smokePool.filter(p => p.o.visible).length, 0);
  assert.equal(system.drifters[0].o.userData.frontWheels.length, 2);
  assert.ok(system.drifters[0].o.userData.frontWheels.every(w => w.rotation.y === driftPose(.08,0).wheelAngle));

  system.update(.08);
  assert.equal(system.skidCount, 2); // Only the car currently sliding leaves marks.
  assert.equal(system.skidGeometry.drawRange.count, 4);
  assert.equal(system.smokePool.filter(p => p.o.visible).length, 2);

  const before = scene.children.length;
  for (let i = 0; i < 110; i++) system.update(.08);
  assert.equal(scene.children.length, before);
  assert.ok(system.skidCount <= system.skidCapacity);
  assert.ok(system.smokePool.filter(p => p.o.visible).length <= 90);
  assert.equal(system.smokePool.length, 90);
});

test('disabling smoke hides particles without stopping vehicle movement or skids', () => {
  const { system } = makeDrift();
  system.update(.16);
  assert.ok(system.smokePool.some(p => p.o.visible));
  system.setSmokeEnabled(false);
  assert.equal(system.smokeEnabled, false);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  const t = system.driftTime;
  system.update(.08);
  assert.ok(system.driftTime > t);
  assert.ok(system.skidCount>0);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  system.setSmokeEnabled(true);
  assert.equal(system.smokeEnabled, true);
  system.update(.16);
  assert.ok(system.smokePool.some(p => p.o.visible));
});

test('drifters yield to the future Golf drive mode, while crowds subtly sway', () => {
  const { system } = makeDrift();
  const predicted = driftPose(.08 + .3, 0);
  const golfPosition = new THREE.Vector3(predicted.x, 0, predicted.z);
  const crowd = [new THREE.Group(), new THREE.Group()];
  system.update(.08, { driving: true, golfPosition, people: crowd });
  assert.equal(system.driftWaiting, true);
  assert.equal(system.driftTime, 0);
  assert.ok(system.smokePool.every(p => !p.o.visible));
  assert.ok(Math.abs(crowd[0].rotation.z - Math.sin(.08 * 1.4) * .015) < 1e-12);
  assert.ok(Math.abs(crowd[1].rotation.z - Math.sin(.08 * 1.4 + 1) * .015) < 1e-12);

  system.update(.16, { people: crowd });
  assert.equal(system.driftWaiting, false);
  assert.ok(system.driftTime > 0);
  assert.ok(system.smokePool.some(p => p.o.visible));
});

test('ten minutes of varied paths stay on parking asphalt and keep both cars separated', () => {
  const {system}=makeDrift();
  for(let t=0;t<600;t+=.1){
    for(const c of system.drifters){
      const p=driftPose(t,c.phase);c.o.position.set(p.x,0,p.z);c.o.rotation.y=p.angle;
      for(const x of [-1.96,1.96])for(const z of [-1.04,1.04])
        assert.ok(pointInLot(p.x+x*Math.cos(p.angle)+z*Math.sin(p.angle),p.z-x*Math.sin(p.angle)+z*Math.cos(p.angle),parkingOutline));
    }
    assert.ok(!carOverlap(system.drifters[0].o.position,system.drifters[0].o.rotation.y,system.drifters[1].o));
  }
});

test('smoke expands, fades and expires, with greater opacity for stronger slip', () => {
  const {system}=makeDrift();
  const point=new THREE.Vector3(0,-.108,0);
  system.emitSmoke(point,0,.2,4);system.emitSmoke(point,0,1,4);
  system.update(.12,{driving:true,golfPosition:system.drifters[0].o.position.clone()});
  const weak=system.smokePool[0],strong=system.smokePool[1];
  assert.ok(strong.o.material.opacity>weak.o.material.opacity);
  const size=strong.o.scale.x,opacity=strong.o.material.opacity;
  system.update(.4,{driving:true,golfPosition:system.drifters[0].o.position.clone()});
  assert.ok(strong.o.scale.x>size&&strong.o.material.opacity<opacity);
  for(let i=0;i<30;i++)system.update(.1,{driving:true,golfPosition:system.drifters[0].o.position.clone()});
  assert.equal(strong.o.visible,false);
});
