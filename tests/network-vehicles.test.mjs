import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {startMultiplayerServer} from '../server/multiplayer.mjs';
import {vehicleCatalog,seatPoint} from '../src/network/vehicleCatalog.js';
import {validWorld,validVehicleState} from '../src/network/vehicleProtocol.js';
import {createWalkingClient} from '../src/network/walkingClient.js';
import {createParkingMeet} from '../src/world/parkingMeet.js';
import {createCarFactory} from '../src/vehicles/car.js';
import {createVehicleRegistry} from '../src/vehicles/vehicleSeats.js';
import {MeshStandardMaterial,Scene} from 'three';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=2500){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out');await wait(5);}return fn();}
async function setup(t,options={}){
  const s=await startMultiplayerServer({port:0,graceMs:200,...options});t.after(()=>s.close());return s;
}
async function connect(t,s,room=null,identity={}){
  const ws=new WebSocket(`ws://127.0.0.1:${s.address().port}/ws`),messages=[];
  ws.on('message',b=>messages.push(JSON.parse(b)));ws.on('error',()=>{});t.after(()=>ws.terminate());
  await until(()=>ws.readyState===1);ws.send(JSON.stringify({type:room?'join':'create',v:1,nickname:'Тест',vehicles:true,...(room?{roomId:room}:{}),...identity}));
  const self=await until(()=>messages.find(m=>m.type==='welcome'));let seq=0;
  return {ws,self,messages,next:()=>++seq,send(type,payload={}){const id=++seq;ws.send(JSON.stringify({type,roomId:self.roomId,playerId:self.playerId,seq:id,...payload}));return id;},
    last:type=>messages.filter(m=>m.type===type).at(-1),result:id=>until(()=>messages.find(m=>m.type==='action-result'&&m.requestId===id))};
}
const pose=(point)=>({...point,yaw:0,moving:false});
async function enter(c,vehicle,seatId){c.send('pose',{pose:pose(seatPoint(vehicle,seatId))});return c.result(c.send('seat-enter',{vehicleId:vehicle.vehicleId,seatId}));}

test('server catalog preserves all nineteen IDs, indices, homes and calibrated door points',()=>{
  const mat=color=>new MeshStandardMaterial({color}),scene=new Scene(),cars=createCarFactory(scene,mat);
  const {parked}=createParkingMeet(scene,mat,{slab:mat(0),concrete:mat(0)},cars),registry=createVehicleRegistry(parked);
  assert.equal(vehicleCatalog.length,19);
  for(const v of vehicleCatalog){const actual=registry.vehicles[v.index];assert.equal(actual.vehicleId,v.vehicleId);assert.equal(actual.car.position.x,v.x);assert.equal(actual.car.position.z,v.z);assert.equal(actual.car.rotation.y,v.yaw);
    actual.car.userData.footprint={halfLength:v.halfLength,halfWidth:v.halfWidth};registry.refresh(actual);
    for(const seat of actual.seats){const a=registry.worldPosition(actual,seat),b=seatPoint(v,seat.seatId);assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-8);}
  }
});
test('all 19 cars have server-confirmed driver/passenger seats; exit, reentry and late join state',async t=>{
  const s=await setup(t),a=await connect(t,s),b=await connect(t,s,a.self.roomId);assert(validWorld(a.last('world')));
  for(const vehicle of vehicleCatalog){
    assert((await enter(a,vehicle,'driver')).ok);assert((await enter(b,vehicle,'front-passenger')).ok);
    const world=b.last('world'),v=world.vehicles.find(v=>v.vehicleId===vehicle.vehicleId);assert.equal(v.seats.driver,a.self.playerId);assert.equal(v.seats['front-passenger'],b.self.playerId);
    const denied=await b.result(b.send('vehicle-state',{vehicleId:v.vehicleId,state:v.state}));assert.equal(denied.code,'not-driver');
    const moving={...v.state,x:v.state.x+.05,speed:1,steer:.1,frontDistance:.05,rearDistance:.05};
    a.send('vehicle-state',{vehicleId:v.vehicleId,state:moving});await until(()=>b.last('vehicle')?.vehicle.vehicleId===v.vehicleId);
    assert.equal(b.last('vehicle').vehicle.state.x,moving.x);
    a.send('vehicle-state',{vehicleId:v.vehicleId,state:{...moving,speed:0}});await wait(10);
    for(const [c,seat] of [[b,'front-passenger'],[a,'driver']])assert((await c.result(c.send('seat-exit',{pose:pose(seatPoint(vehicle,seat))}))).ok);
    await wait(160); // Respect production token bucket across the repeated scenario.
  }
});
test('concurrent same-seat requests are atomic; distance, unknown IDs and roles are checked',async t=>{
  const s=await setup(t),a=await connect(t,s),b=await connect(t,s,a.self.roomId),v=vehicleCatalog[18];
  assert.equal((await a.result(a.send('seat-enter',{vehicleId:v.vehicleId,seatId:'driver'}))).code,'too-far');
  for(const c of [a,b])c.send('pose',{pose:pose(seatPoint(v,'driver'))});
  const ids=[a.send('seat-enter',{vehicleId:v.vehicleId,seatId:'driver'}),b.send('seat-enter',{vehicleId:v.vehicleId,seatId:'driver'})];
  const results=await Promise.all([a.result(ids[0]),b.result(ids[1])]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'seat-occupied');
  const c=await connect(t,s);c.send('seat-enter',{vehicleId:'invented',seatId:'driver'});await until(()=>c.last('error'));assert.equal(c.last('error').code,'invalid-seat');
});
test('driver state is owner-bound, bounded and persistent; teleport/reverse/steer/wheels/reset permission',async t=>{
  const s=await setup(t),a=await connect(t,s),b=await connect(t,s,a.self.roomId),v=vehicleCatalog[18];
  await enter(a,v,'driver');await enter(b,v,'front-passenger');const initial=a.last('world').vehicles[18].state;
  assert(!validVehicleState({...initial,speed:Infinity},v.vehicleId));assert(!validVehicleState({...initial,steer:1},v.vehicleId));
  let next={...initial,z:initial.z+.1,speed:1,steer:.3,frontDistance:.1,rearDistance:.1};a.send('vehicle-state',{vehicleId:v.vehicleId,state:next});await until(()=>b.last('vehicle'));
  assert.deepEqual(b.last('vehicle').vehicle.state,next);
  assert.equal((await b.result(b.send('vehicle-reset',{vehicleId:v.vehicleId}))).code,'not-driver');
  assert.equal((await a.result(a.send('seat-exit',{pose:pose(seatPoint(v,'driver'))}))).code,'vehicle-moving');
  const teleport={...next,z:50};assert.equal((await a.result(a.send('vehicle-state',{vehicleId:v.vehicleId,state:teleport}))).code,'movement-rejected');
  assert.equal(a.last('world').vehicles[18].state.z,next.z);assert.equal(a.last('world').vehicles[18].state.speed,0);
  next={...next,z:initial.z,speed:-1,handbrake:true,frontDistance:0,rearDistance:.1};a.send('vehicle-state',{vehicleId:v.vehicleId,state:next});await until(()=>b.last('vehicle').vehicle.state.speed===-1);
  assert.equal(b.last('vehicle').vehicle.state.rearDistance,.1);
  a.send('vehicle-state',{vehicleId:v.vehicleId,state:{...next,speed:0}});await wait(15);
  assert((await a.result(a.send('vehicle-reset',{vehicleId:v.vehicleId}))).ok);assert.equal(a.last('world').vehicles[18].state.z,v.z);
  b.ws.close();await wait(260);const late=await connect(t,s,a.self.roomId);assert.deepEqual(late.last('world').vehicles[18].state,a.last('world').vehicles[18].state);
});
test('driver disconnect stops last agreed pose, holds seat for resume, then expires exactly once',async t=>{
  const s=await setup(t,{graceMs:250}),a=await connect(t,s),b=await connect(t,s,a.self.roomId),v=vehicleCatalog[5];
  await enter(a,v,'driver');await enter(b,v,'front-passenger');const initial=a.last('world').vehicles[5].state;
  a.send('vehicle-state',{vehicleId:v.vehicleId,state:{...initial,x:initial.x+.1,speed:1,frontDistance:.1,rearDistance:.1}});
  await until(()=>b.last('vehicle'));a.ws.terminate();await until(()=>b.last('world').vehicles[5].state.speed===0);
  assert.equal(b.last('world').vehicles[5].seats.driver,a.self.playerId);
  const resumed=await connect(t,s,a.self.roomId,{playerId:a.self.playerId,resumeToken:a.self.resumeToken});assert.equal(resumed.last('world').vehicles[5].seats.driver,a.self.playerId);
  resumed.ws.terminate();await until(()=>b.last('world').vehicles[5].seats.driver===null);
  assert.equal(b.last('world').vehicles[5].seats['front-passenger'],b.self.playerId);assert.equal(b.last('world').vehicles[5].state.x,initial.x+.1);
});
test('production transport negotiates vehicle capability and receives complete world before commands',async t=>{
  const s=await setup(t);let world=null,session=null,result=null;
  const c=createWalkingClient({WebSocketImpl:WebSocket,getPose:()=>({x:-18,y:-.12,z:-8,yaw:0,moving:false}),onWorld:w=>world=w,onSession:v=>session=v,onAction:r=>result=r});t.after(()=>c.dispose());
  c.connect({url:`ws://127.0.0.1:${s.address().port}/ws`,create:true,nickname:'А'});await until(()=>session&&world);
  assert(validWorld(world));const id=c.command('vehicle-reset',{vehicleId:vehicleCatalog[0].vehicleId});await until(()=>result?.requestId===id);assert.equal(result.code,'not-driver');
});

test('rear seats remain passengers and server rejects wrong-side/interior exit positions',async t=>{
  const s=await setup(t),a=await connect(t,s),b=await connect(t,s,a.self.roomId),v=vehicleCatalog[16];
  await enter(a,v,'driver');assert((await enter(b,v,'rear-right')).ok);
  assert.equal((await b.result(b.send('vehicle-reset',{vehicleId:v.vehicleId}))).code,'not-driver');
  const inside=pose({x:v.x,y:-.12,z:v.z});assert.equal((await b.result(b.send('seat-exit',{pose:inside}))).code,'unsafe-exit');
  assert.equal((await b.result(b.send('seat-exit',{pose:pose(seatPoint(v,'rear-left'))}))).code,'unsafe-exit');
  assert((await b.result(b.send('seat-exit',{pose:pose(seatPoint(v,'rear-right'))}))).ok);
  assert((await enter(b,v,'rear-left')).ok);assert.equal(b.last('world').vehicles[16].seats['rear-left'],b.self.playerId);
});
test('vehicle replay, forged role and non-finite wheel travel close only the offending driver',async t=>{
  for(const extra of ['replay','role','wheel']){
    const s=await setup(t),a=await connect(t,s),b=await connect(t,s,a.self.roomId),v=vehicleCatalog[2];await enter(a,v,'driver');
    const state=a.last('world').vehicles[2].state,id=a.send('vehicle-state',{vehicleId:v.vehicleId,state});await until(()=>b.last('vehicle'));
    let message={type:'vehicle-state',roomId:a.self.roomId,playerId:a.self.playerId,vehicleId:v.vehicleId,seq:extra==='replay'?id:id+1,state};
    if(extra==='role')message.role='driver';if(extra==='wheel')message.state={...state,frontDistance:'Infinity'};
    a.ws.send(JSON.stringify(message));await until(()=>a.last('error'));assert.equal(a.last('error').code,'invalid-state');
    assert.equal(b.ws.readyState,1);assert.equal(s.rooms.get(a.self.roomId).fleet.vehicles.get(v.vehicleId).state.x,v.x);
  }
});
test('world schema rejects duplicate car IDs, duplicate seat owners and malformed car state',async t=>{
  const s=await setup(t),a=await connect(t,s),world=a.last('world');assert(validWorld(world));
  for(const change of [w=>w.vehicles[1]=w.vehicles[0],w=>w.vehicles[0].state.speed='0',w=>w.vehicles[0].seats.extra=null,
    w=>{w.vehicles[0].seats.driver=a.self.playerId;w.vehicles[1].seats.driver=a.self.playerId;}]){
    const copy=structuredClone(world);change(copy);assert(!validWorld(copy));
  }
});
