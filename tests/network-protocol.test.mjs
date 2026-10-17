import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Scene, Sprite } from 'three';
import { exact, validNickname, validPose, validRoom, validId } from '../src/network/protocol.js';
import { websocketURL, roomLink } from '../src/network/walkingClient.js';
import { createRemotePlayers } from '../src/network/remotePlayers.js';
import { createControlModes } from '../src/player/controlModes.js';

test('walking wire schema rejects coercions, non-finite/out-of-world coordinates and vehicle fields',()=>{
  const pose={x:-18,y:-.12,z:-8,yaw:Math.PI,moving:false};
  assert(validPose(pose));assert(!validPose({...pose,x:Infinity}));assert(!validPose({...pose,y:4}));
  assert(!validPose({...pose,moving:1}));assert(!validPose({...pose,vehicleId:'golf'}));
  assert(!validPose({...pose,x:'-18'}));assert(!validRoom(['abcdefghijklmnop']));assert(!validId(null));
  assert(!exact([],[]));assert(!exact(null,[]));assert(!exact({type:'pose',__proto__:null},['type','pose']));
  assert(validNickname('Игрок А'));assert(validNickname('<img src=x>'));
  for(const nick of ['',' ',' a','a\nb','a\u202eb','x'.repeat(25),12])assert(!validNickname(nick));
});

test('room links contain room/server only, require explicit valid WebSocket endpoint',()=>{
  assert.equal(websocketURL('ws://127.0.0.1:8787/ws'),'ws://127.0.0.1:8787/ws');
  for(const url of ['javascript:alert(1)','https://example.com/ws','ws://a:pass@localhost/ws','ws://localhost/other','ws://localhost/ws?q=1'])assert.throws(()=>websocketURL(url));
  assert.throws(()=>websocketURL('ws://localhost/ws',true));
  assert.equal(websocketURL('wss://example.com/ws',true),'wss://example.com/ws');
  const link=new URL(roomLink('http://localhost:5173/?view=parking#old','abcdefghijklmnop','ws://localhost:8787/ws'));
  assert.equal(link.searchParams.get('room'),'abcdefghijklmnop');assert.equal(link.hash,'');
  assert(!link.searchParams.has('playerId'));assert(!link.searchParams.has('resumeToken'));
});

test('remote interpolation takes shortest yaw arc, ignores old packets, freezes on gaps and disposes once',()=>{
  let time=0,labelsDisposed=0;
  const scene=new Scene(),local=new Group();scene.add(local);
  const remotes=createRemotePlayers(scene,{now:()=>time,delayMs:120,makeLabel:()=>{
    const label=new Sprite();label.userData.dispose=()=>labelsDisposed++;return label;
  }});
  const record={playerId:'peer',nickname:'Б',seq:1,pose:{x:0,y:-.12,z:0,yaw:Math.PI-.1,moving:false}};
  remotes.roster([record]);remotes.roster([record]);assert.equal(scene.children.length,2);
  time=100;remotes.receive({playerId:'peer',seq:2,pose:{...record.pose,x:2,yaw:-Math.PI+.1,moving:true}});
  remotes.receive({playerId:'peer',seq:1,pose:{...record.pose,x:90}});
  time=200;remotes.update(.016);let s=remotes.snapshot()[0];
  assert(Math.abs(s.position[0]-1.6)<1e-10);assert(Math.abs(s.yaw-Math.PI)<.1);assert(s.stride>0);
  assert.deepEqual(local.position.toArray(),[0,0,0]);
  time=2000;remotes.update(1);s=remotes.snapshot()[0];assert.equal(s.position[0],2);assert(s.stride<.001);
  for(let seq=3;seq<100;seq++){time++;remotes.receive({playerId:'peer',seq,pose:record.pose});}
  assert(remotes.snapshot()[0].samples<=32);
  const model=scene.children.find(o=>o.name==='remote-player'),geometries=new Set(),materials=new Set();
  model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  let disposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
  remotes.clear();remotes.clear();assert.equal(scene.children.length,1);assert.equal(labelsDisposed,1);
  // Label has its own disposal path; the character's geometry is disposed too.
  assert(disposed>=geometries.size-1);assert.equal(remotes.snapshot().length,0);
});

test('walking-only guard rejects legacy drive, presets, walk exit and seats, then restores single-player',()=>{
  const drive={state:{active:false},setDriving(v){this.state.active=v;},startLegacy(){this.state.active=true;},
    stopDriving(){this.state.active=false;}};
  const pedestrian={state:{active:false},setWalking(v){this.state.active=v;return v;}};
  const modes=createControlModes(drive,pedestrian);modes.attachSeating({isSeated:()=>false});
  assert(modes.setWalkingOnly(true));assert.equal(modes.canEnterVehicle(),false);
  assert.equal(drive.setDriving(true),false);assert.equal(modes.overview(),false);assert.equal(modes.walk(false),false);
  assert(pedestrian.state.active);assert(!drive.state.active);
  modes.setWalkingOnly(false);assert(modes.canEnterVehicle());drive.setDriving(true);assert(drive.state.active);
  assert.equal(modes.setWalkingOnly(true),false);
});
