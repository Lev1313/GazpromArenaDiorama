import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPedestrian, vehicleOutline, pedestrianRadius } from '../src/player/pedestrian.js';
import { createControlModes } from '../src/player/controlModes.js';
import { createGolfDrive } from '../src/vehicles/golfDrive.js';
import { captureGroundSurface } from '../src/player/groundSurface.js';

const land = [[-40,-50],[40,-50],[40,50],[-40,50]];
function car(x,z,length=1.96,width=1.04,yaw=0) {
  const c=new THREE.Group(); c.position.set(x,0,z); c.rotation.y=yaw;
  c.userData.footprint={halfLength:length,halfWidth:width}; c.userData.frontWheels=[]; return c;
}
function fixture(extra={}) {
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(); camera.position.set(0,20,30);
  const controls={target:new THREE.Vector3(),enabled:true,enableDamping:true,update(){}};
  const parked=extra.parked??[];
  const p=createPedestrian({scene,camera,controls,parked,parkingOutline:land,islandOutline:land,...extra});
  p.setWalking(true); return {p,camera,controls,scene};
}
function travel(p,seconds,fps=60){for(let i=0;i<seconds*fps;i++)p.update(1/fps);}
test('safe parking spawn, proportions, idle, hide and exact camera restoration',()=>{
  const {p,camera,controls}=fixture({parked:[car(-18,-8)]});
  assert(!p.collision(p.model.position.x,p.model.position.z));
  const bounds=new THREE.Box3().setFromObject(p.model); assert(bounds.getSize(new THREE.Vector3()).y>1.6);
  assert(p.model.visible && !controls.enabled); travel(p,1); assert.equal(p.state.speed,0);
  p.setWalking(false); assert(!p.model.visible && controls.enabled);
  assert.deepEqual(camera.position.toArray(),[0,20,30]); assert.deepEqual(controls.target.toArray(),[0,0,0]);
});
test('camera-relative WASD, normalized diagonals, Shift and FPS-independent distance',()=>{
  const run=(fps,codes=['KeyW'],yaw=0)=>{const {p}=fixture();p.state.cameraYaw=yaw;for(const c of codes)p.setKey(c,true);travel(p,2,fps);return p;};
  const a=run(30),b=run(60),c=run(144),slow=run(15);
  assert(a.model.position.distanceTo(b.model.position)<1e-6 && a.model.position.distanceTo(c.model.position)<1e-6
    && a.model.position.distanceTo(slow.model.position)<1e-6);
  const diagonal=run(60,['KeyW','KeyD']); assert(Math.abs(diagonal.model.position.distanceTo(new THREE.Vector3(-18,-.12,-8))-4.4)<1e-6);
  assert(run(60,['KeyW','ShiftLeft']).model.position.z<a.model.position.z);
  assert(run(60,['KeyW'],Math.PI/2).model.position.x>-14);
});
for(const [name,length,width,yaw] of [['Golf',2.1375,1.0395,0],['Lexus',2.4327,1.0763,Math.PI/2],['Mercedes',2.56,1.132,Math.PI/2]]) {
  test(`${name}: actual footprint blocks walking, corners and rotated sides`,()=>{
    const c=car(-22.4,-8,length,width,yaw),{p}=fixture({parked:[c]});
    p.setKey('KeyA',true);travel(p,4);
    assert(p.model.position.x>-22.4+(yaw?width:length)+pedestrianRadius);
    assert(!p.collision(p.model.position.x,p.model.position.z));
    for(const [x,z] of vehicleOutline(c))assert(p.collision(x,z));
  });
}
test('diagonal slide follows wall and does not tunnel through a thin fence',()=>{
  const wall={outline:[[-19,-30],[-18.9,-30],[-18.9,30],[-19,30]],minX:-19,maxX:-18.9,minZ:-30,maxZ:30,minY:0,maxY:2};
  const {p}=fixture({staticObstacles:[wall]});p.setKey('KeyA',true);p.setKey('KeyW',true);travel(p,3,30);
  assert(p.model.position.x>-18.9+pedestrianRadius);assert(p.model.position.z<-11);
  assert(!p.collision(p.model.position.x,p.model.position.z));
  p.update(.5);assert(p.model.position.x>-18.9+pedestrianRadius);
});
test('shoreline keeps full radius on land, ground follows surface, podium blocked',()=>{
  const {p}=fixture({getGroundHeight:(x,z)=>z<-10?-.45:-.12,isWalkable:(x,z)=>Math.hypot(x-20,z)>5});
  p.setKey('KeyW',true);travel(p,30);assert(p.model.position.z>-50+pedestrianRadius);
  assert.equal(p.model.position.y,-.45);assert(p.collision(20,0));assert(p.collision(-39.9,0));
});
test('spectators, lamps, tables, visitors and drifters block; hidden visitors do not',()=>{
  const person=car(-17,-8),visitor={o:car(-15,-8)},drifter={o:car(-12,-8)};
  const {p}=fixture({people:[person],visitors:[visitor],drifters:[drifter]});
  for(const x of [-17,-15,-12])assert(p.collision(x,-8));
  assert(p.collision(10,-5.5));assert(p.collision(8,12));visitor.o.visible=false;assert(!p.collision(-15,-8));
});
test('late GLB footprint and moving obstacles recover to a free point',()=>{
  const c=car(-24,-8),{p}=fixture({parked:[c]});c.position.copy(p.model.position);p.update(1/60);
  assert(p.state.active && !p.collision(p.model.position.x,p.model.position.z));
  p.resetPosition();assert(!p.collision(p.model.position.x,p.model.position.z));
});
test('smooth yaw across wrap, finite camera, no orbit enabled, walk settles to idle',()=>{
  const {p,camera}=fixture();p.state.yaw=Math.PI-.01;p.setKey('KeyW',true);p.update(1/60);
  assert(Math.abs(p.state.yaw-Math.PI)<.02);travel(p,1);assert(p.state.stride>.9);
  p.clearKeys();travel(p,1);assert(p.state.stride<.001);
  p.rotateCamera(2);p.updateCamera(1/60);assert(camera.position.toArray().every(Number.isFinite));
});
test('real Golf controller and walk transitions are exclusive and restore overview',()=>{
  const {p,camera,controls}=fixture();p.setWalking(false);
  const golf=car(-22.4,16);
  const drive=createGolfDrive({golf,parked:[golf],people:[],visitors:[],drifters:[],camera,controls,lotOutline:land,drift:{}});
  const modes=createControlModes(drive,p);
  drive.setDriving(true);drive.setKey('KeyW',true);modes.walk(true);
  assert(p.state.active && !drive.state.active && drive.keys.size===0);
  drive.setDriving(true);assert(drive.state.active && !p.state.active && p.keys.size===0);
  drive.updateDriving(.1);modes.overview();assert(!drive.state.active && !p.state.active && controls.enabled);
  assert.deepEqual(camera.position.toArray(),[0,20,30]);
});
test('actual flat ground keeps feet above paths/curbs, ignores paint, water and overheads',()=>{
  const scene=new THREE.Scene();
  const box=(w,h,d,x,y,z)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));o.position.set(x,y,z);scene.add(o);};
  box(2.2,.1,20,0,-.2,0);box(.3,.18,20,3,-.08,0);
  box(.3,.025,2,0,-.09,0);box(100,.15,100,0,-.7,0);box(10,.2,10,0,10,0);
  const height=captureGroundSurface(scene);
  assert(Math.abs(height(0,0)+.15)<1e-6);assert(Math.abs(height(3,0)-.01)<1e-6);
  assert.equal(height(10,10),-.45);
});
