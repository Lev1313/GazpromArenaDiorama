import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startMultiplayerServer } from '../server/multiplayer.mjs';
import { createWalkingClient } from '../src/network/walkingClient.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=2000){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timed out');await sleep(5);}return fn();}
async function server(t,options={}){const s=await startMultiplayerServer({port:0,graceMs:300,...options});t.after(()=>s.close());return s;}
async function client(t,s,options={}) {
  const ws=new WebSocket(`ws://127.0.0.1:${s.address().port}/ws`,options),messages=[];
  let closed=null;ws.on('message',b=>messages.push(JSON.parse(b.toString())));ws.on('error',()=>{});ws.on('close',code=>closed=code);
  t.after(()=>ws.terminate());await until(()=>ws.readyState===1);
  return {ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:predicate=>until(()=>messages.find(predicate)),closed:()=>closed};
}
async function create(t,s,nickname='Игрок А'){const c=await client(t,s);c.send({type:'create',v:1,nickname});c.self=await c.wait(m=>m.type==='welcome');return c;}
async function join(t,s,a,nickname='Игрок Б'){const c=await client(t,s);c.send({type:'join',v:1,nickname,roomId:a.self.roomId});c.self=await c.wait(m=>m.type==='welcome');return c;}
const pose={x:-17,y:-.12,z:-8,yaw:0,moving:true};
const state=(self,seq=1)=>({type:'pose',roomId:self.roomId,playerId:self.playerId,seq,pose:{...pose}});

test('real WebSocket room: unpredictable ID, two independent identities, state relay and third-player rejection',async t=>{
  const s=await server(t),a=await create(t,s,'<img src=x>'),b=await join(t,s,a);
  assert.match(a.self.roomId,/^[\w-]{16}$/);assert.notEqual(a.self.playerId,b.self.playerId);
  assert.equal(b.self.players.length,2);assert.equal(b.self.players[0].nickname,'<img src=x>');
  a.send(state(a.self));const message=await b.wait(m=>m.type==='pose');
  assert.equal(message.playerId,a.self.playerId);assert.deepEqual(message.pose,pose);
  assert.equal(s.rooms.get(a.self.roomId).players.get(b.self.playerId).pose.x,-16);
  const third=await client(t,s);third.send({type:'join',v:1,nickname:'В',roomId:a.self.roomId});
  assert.equal((await third.wait(m=>m.type==='error')).code,'room-full');
  const other=await create(t,s);assert.notEqual(other.self.roomId,a.self.roomId);
});

test('disconnect disappears immediately; reserved slot resumes with same ID and active duplicate is denied',async t=>{
  const s=await server(t,{graceMs:1000}),a=await create(t,s),b=await join(t,s,a);
  a.ws.terminate();await until(()=>b.messages.some(m=>m.type==='roster'&&m.players.length===1));
  const resumed=await client(t,s);resumed.send({type:'join',v:1,nickname:'А',roomId:a.self.roomId,
    playerId:a.self.playerId,resumeToken:a.self.resumeToken});
  const welcome=await resumed.wait(m=>m.type==='welcome');assert.equal(welcome.playerId,a.self.playerId);
  assert.equal(s.rooms.get(a.self.roomId).players.size,2);
  const duplicate=await client(t,s);duplicate.send({type:'join',v:1,nickname:'А',roomId:a.self.roomId,
    playerId:a.self.playerId,resumeToken:a.self.resumeToken});
  assert.equal((await duplicate.wait(m=>m.type==='error')).code,'session-active');
});

test('identity and room ownership cannot be supplied for another socket; forged credentials fail',async t=>{
  const s=await server(t),a=await create(t,s),b=await join(t,s,a);
  a.send({...state(a.self),playerId:b.self.playerId});
  assert.equal((await a.wait(m=>m.type==='error')).code,'identity-mismatch');
  const fake=await client(t,s);fake.send({type:'join',v:1,nickname:'А',roomId:a.self.roomId,
    playerId:a.self.playerId,resumeToken:'X'.repeat(32)});
  assert.equal((await fake.wait(m=>m.type==='error')).code,'resume-expired');
  b.send({...state(b.self),roomId:'abcdefghijklmnop'});
  assert.equal((await b.wait(m=>m.type==='error')).code,'identity-mismatch');
});

test('invalid format, binary, excessive payload and replayed state close only the offending socket',async t=>{
  const s=await server(t);
  for(const payload of ['{',JSON.stringify({type:'create',v:2,nickname:'А'}),Buffer.from('binary'),'x'.repeat(1100)]) {
    const c=await client(t,s);c.ws.send(payload);await until(()=>c.closed()!==null);
    assert([1008,1009].includes(c.closed()));
  }
  for(const change of [{pose:{...pose,x:Infinity}},{pose:{...pose,x:200}},{vehicleId:'golf'}]) {
    const c=await create(t,s);c.send({...state(c.self),...change});assert.equal((await c.wait(m=>m.type==='error')).code,'invalid-state');
  }
  const c=await create(t,s);c.send(state(c.self));c.send(state(c.self));
  assert.equal((await c.wait(m=>m.type==='error')).code,'invalid-state');
  const healthy=await create(t,s);assert(healthy.self.playerId);
});

test('bounded message rate, handshake deadline and idle-room cleanup',async t=>{
  const s=await server(t,{rate:2,burst:3,handshakeMs:100,graceMs:80});
  const idle=await client(t,s);assert.equal((await idle.wait(m=>m.type==='error')).code,'handshake-timeout');
  const c=await create(t,s);for(let seq=1;seq<=5;seq++)c.send(state(c.self,seq));
  assert.equal((await c.wait(m=>m.type==='error')).code,'rate-limit');
  await until(()=>s.rooms.size===0);
});

test('explicit leave releases the room without reserving a slot; origin and room caps are enforced',async t=>{
  const s=await server(t,{maxRooms:1});const a=await create(t,s);
  const full=await client(t,s);full.send({type:'create',v:1,nickname:'Б'});
  assert.equal((await full.wait(m=>m.type==='error')).code,'server-full');
  a.send({type:'leave',roomId:a.self.roomId,playerId:a.self.playerId});await until(()=>s.rooms.size===0);
  const denied=new WebSocket(`ws://127.0.0.1:${s.address().port}/ws`,{origin:'https://invalid.example'});
  denied.on('error',()=>{});t.after(()=>denied.terminate());
  const code=await new Promise(resolve=>denied.on('unexpected-response',(_req,res)=>{res.resume();denied.terminate();resolve(res.statusCode);}));
  assert.equal(code,403);
});

test('two production transports exchange walking and automatically reconnect to the real server',async t=>{
  const s=await server(t,{graceMs:1500});let position={...pose},rosterA=[],rosterB=[],receivedB=[],resumed=false;
  const a=createWalkingClient({WebSocketImpl:WebSocket,getPose:()=>position,onRoster:r=>rosterA=r,
    onSession:session=>{if(session?.resumed)resumed=true;},retryMs:20});
  const b=createWalkingClient({WebSocketImpl:WebSocket,getPose:()=>({...pose,x:-16,moving:false}),
    onRoster:r=>rosterB=r,onPose:m=>receivedB.push(m),retryMs:20});
  t.after(()=>{a.dispose();b.dispose();});
  const url=`ws://127.0.0.1:${s.address().port}/ws`;
  a.connect({url,nickname:'А',create:true});await until(()=>a.getStatus().phase==='connected');
  const identity=a.getStatus().playerId,roomId=a.getStatus().roomId;
  b.connect({url,nickname:'Б',roomId});await until(()=>b.getStatus().peers===1&&a.getStatus().peers===1);
  position={...position,x:-15};await until(()=>receivedB.some(m=>m.pose.x===-15));
  assert.equal(rosterA.length,1);assert.equal(rosterB.length,1);
  s.rooms.get(roomId).players.get(identity).ws.terminate();
  await until(()=>resumed&&a.getStatus().phase==='connected');
  assert.equal(a.getStatus().playerId,identity);assert.equal(rosterB.length,1);
  a.leave();await until(()=>b.getStatus().peers===0);b.leave();await until(()=>s.rooms.size===0);
  assert.equal(a.getStatus().phase,'offline');assert(!a.active);
});

test('active browser-style pose traffic survives missing proxy pong frames across heartbeats',async t=>{
  const s=await server(t,{heartbeatMs:30});
  const c=await client(t,s,{autoPong:false});
  c.send({type:'create',v:1,nickname:'Активный'});
  c.self=await c.wait(m=>m.type==='welcome');
  // Simulate a reverse proxy dropping WebSocket control pongs while forwarding
  // ordinary 10 Hz game traffic (accelerated clocks to keep the test cheap).
  for(let seq=1;seq<=10;seq++){
    await sleep(14);
    c.send(state(c.self,seq));
  }
  await until(()=>s.rooms.get(c.self.roomId).players.get(c.self.playerId).seq===10);
  assert.equal(c.ws.readyState,WebSocket.OPEN);
  assert.equal(c.closed(),null);
});

test('heartbeat removes an unresponsive connection while a responsive peer stays connected',async t=>{
  const s=await server(t,{heartbeatMs:30});
  const a=await create(t,s),b=await client(t,s,{autoPong:false});
  b.send({type:'join',v:1,nickname:'Б',roomId:a.self.roomId});await b.wait(m=>m.type==='welcome');
  await until(()=>b.closed()!==null);
  assert.equal(b.closed(),1006);assert.equal(a.ws.readyState,1);
  await until(()=>a.messages.some(m=>m.type==='roster'&&m.players.length===1));
});

test('session callback may cancel a join without late roster events or restarted send timers',async t=>{
  const s=await server(t);let reads=0,lateRoster=false,cancelled=false;
  const transport=createWalkingClient({WebSocketImpl:WebSocket,getPose:()=>{reads++;return pose;},
    onSession:session=>{if(session){cancelled=true;transport.leave();}},
    onRoster:players=>{if(cancelled&&players.length)lateRoster=true;},sendMs:20});
  t.after(()=>transport.dispose());
  transport.connect({url:`ws://127.0.0.1:${s.address().port}/ws`,nickname:'А',create:true});
  await until(()=>cancelled);await sleep(80);
  assert.equal(transport.getStatus().phase,'offline');assert.equal(reads,0);assert(!lateRoster);
  await until(()=>s.rooms.size===0);
});

test('expired first player can rejoin with a new ID in the freed spawn slot',async t=>{
  const s=await server(t,{graceMs:80}),a=await create(t,s),b=await join(t,s,a);
  a.ws.terminate();await until(()=>s.rooms.get(a.self.roomId).players.size===1);
  const fresh=await join(t,s,a,'Новый А');
  assert.notEqual(fresh.self.playerId,a.self.playerId);
  const own=fresh.self.players.find(p=>p.playerId===fresh.self.playerId);
  const other=fresh.self.players.find(p=>p.playerId===b.self.playerId);
  assert.equal(own.pose.x,-18);assert.equal(other.pose.x,-16);
});
