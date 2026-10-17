import { build } from 'vite';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import WebSocket, { WebSocketServer } from 'ws';
import { startServer } from './serve.mjs';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'browser-tests/_current/multiplayer');
await mkdir(out,{recursive:true});
const suite=await readFile(resolve(root,'tools/vite-functional.mjs'),'utf8');
const observation=suite.match(/const observation = `([\s\S]*?)`;\r?\n\r?\nfunction clock/)[1];
const clock=suite.slice(suite.indexOf('function clock()'),suite.indexOf('const snapshot ='));
const extra=`
window.__readNetwork=()=>({...multiplayer.snapshot(),local:{position:pedestrian.model.position.toArray(),yaw:pedestrian.state.yaw,
  playerId:pedestrian.state.playerId,mode:pedestrian.state.mode,keys:[...pedestrian.keys]},drive:drive.state.active,
  remoteRoots:scene.children.filter(o=>o.name==='remote-player').length,renderFrames:renderer.info.render.frame,
  canvases:document.querySelectorAll('canvas').length});
window.__networkView=()=>{const bodies=[pedestrian.model,...scene.children.filter(o=>o.name==='remote-player')];
  const center=new THREE.Vector3();for(const body of bodies)center.add(body.position);center.multiplyScalar(1/bodies.length);
  camera.position.copy(center).add(new THREE.Vector3(0,3.3,8));controls.target.copy(center).add(new THREE.Vector3(0,1,0));
  camera.lookAt(controls.target);renderer.render(scene,camera);};
window.__rideView=()=>{const car=vehicleRegistry.get('parked-mercedes-gla-x156').car;
  camera.position.copy(car.localToWorld(new THREE.Vector3(6,3.1,6)));
  controls.target.copy(car.position).add(new THREE.Vector3(0,.8,0));camera.lookAt(controls.target);renderer.render(scene,camera);};`;
const report={ok:false,checks:[],errors:[],screenshots:[],method:'Separate Node WebSocket process; two isolated Edge contexts; actual UI and keyboard. Manual local simulation clock, native monotonic receive clock. Real WebSocket delay proxy (200 ms each direction).'};
const check=(name,condition,detail='')=>{report.checks.push({name,ok:Boolean(condition),detail});console.log((condition?'PASS ':'FAIL ')+name);assert(condition,name+' '+detail);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=15000){const start=Date.now();while(!await fn()){if(Date.now()-start>timeout)throw Error('Timed out waiting for network condition');await wait(50);}}
const read=page=>page.evaluate(()=>window.__readNetwork());
const scene=page=>page.evaluate(()=>window.__readDiorama());
const step=(page,n=1,render=false)=>page.evaluate(([n,draw])=>window.__step(n,draw),[n,render]);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
let child,http,browser,proxy;
const proxySockets=new Set();
async function startChild() {
  child=spawn(process.execPath,['server/multiplayer.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>report.errors.push('server: '+b));
  await until(()=>/ws:\/\/127\.0\.0\.1:\d+\/ws/.test(output));
  report.serverProcess=true;return output.match(/ws:\/\/127\.0\.0\.1:\d+\/ws/)[0];
}
async function delayedServer(target,latency) {
  const server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:1024,perMessageDeflate:false});
  await new Promise(done=>server.once('listening',done));
  server.on('connection',down=>{
    const up=new WebSocket(target),timers=new Set();proxySockets.add(down);proxySockets.add(up);
    const forward=(destination,data,binary)=>{const timer=setTimeout(()=>{timers.delete(timer);if(destination.readyState===1)destination.send(data,{binary});},latency);timers.add(timer);};
    down.on('message',(d,b)=>forward(up,d,b));up.on('message',(d,b)=>forward(down,d,b));
    for(const socket of [down,up])socket.on('error',()=>{});
    const close=()=>{timers.forEach(clearTimeout);timers.clear();for(const socket of [down,up]){proxySockets.delete(socket);if(socket.readyState<2)socket.close();}};
    down.on('close',close);up.on('close',close);
  });
  return server;
}
async function load(context,url) {
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.location()?.url.includes('favicon'))report.errors.push(m.text());});
  page.on('dialog',async d=>{report.errors.push('Unexpected dialog: '+d.message());await d.dismiss();});
  await page.addInitScript({content:`window.__networkClock=performance.now.bind(performance);
    window.__testSockets=[];const NativeWebSocket=WebSocket;window.WebSocket=class extends NativeWebSocket{constructor(...args){super(...args);window.__testSockets.push(this);}};
    ${clock}\nclock();`});
  await page.goto(url);
  await page.waitForFunction(()=>window.__readNetwork&&document.querySelector('#view').dataset.glaModel==='loaded'
    &&document.querySelector('#view').dataset.lexusModel==='loaded'&&document.querySelector('#view').dataset.mercedesModel==='loaded',null,{polling:100,timeout:120000});
  await step(page,2,true);return page;
}
async function click(page,id){await page.locator('#'+id).click();await step(page,1,false);}
async function photo(page,name){await page.evaluate(()=>window.__networkView());await page.screenshot({path:out+'/'+name+'.png',timeout:120000});report.screenshots.push(name+'.png');}
async function sync(a,b,ms=500){const end=Date.now()+ms;while(Date.now()<end){await step(a,2);await step(b,2);await wait(30);}await step(a,1,true);await step(b,1,true);}
try {
  await build({root,logLevel:'error',build:{outDir:out+'/dist',emptyOutDir:false},plugins:[{name:'private-network-observation',transform(code,id){
    const file=id.replaceAll('\\','/');
    if(file===root.replaceAll('\\','/')+'/src/main.js')return code+'\n'+observation+extra;
    // Preserve the real receive clock while only local movement uses the manual RAF clock.
    if(file.endsWith('/src/network/remotePlayers.js')||file.endsWith('/src/network/networkVehicles.js'))return code.replace('now=()=>performance.now()','now=()=>window.__networkClock()');
  }}]});
  const endpoint=await startChild();
  http=await startServer({root:out+'/dist',port:0});const url='http://127.0.0.1:'+http.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--force-color-profile=srgb']});report.browser=browser.version();
  const ca=await browser.newContext({viewport:{width:1400,height:900}}),cb=await browser.newContext({viewport:{width:1400,height:900}});
  const a=await load(ca,url);await click(a,'day');await click(a,'walk');
  const baseA=(await scene(a)).resources;
  check('Single-player starts with no socket or remote avatar',!(await read(a)).status.playerId&&(await read(a)).remoteRoots===0
    &&await a.evaluate(()=>window.__testSockets.length===0));
  await click(a,'multiplayerToggle');await a.locator('#mpServer').fill(endpoint);await a.locator('#mpNickname').fill('Игрок А');await click(a,'mpCreate');
  await until(async()=>(await read(a)).status.phase==='connected');await step(a,2,true);
  const first=await read(a),roomId=first.status.roomId,identity=first.status.playerId;
  check('UI creates unpredictable room and server player ID',/^[\w-]{16}$/.test(roomId)&&identity!==null&&first.local.playerId===identity);
  const link=await a.locator('#mpLink').inputValue();check('Share link contains room and endpoint, never reconnect secret',new URL(link).searchParams.get('room')===roomId&&!link.includes('resumeToken'));
  const b=await load(cb,link);await click(b,'day');await click(b,'walk');const baseB=(await scene(b)).resources;
  await click(b,'multiplayerToggle');check('Room link prefills join form',await b.locator('#mpCode').inputValue()===roomId&&await b.locator('#mpServer').inputValue()===endpoint);
  await b.locator('#mpNickname').fill('Игрок Б');await click(b,'mpJoin');
  await until(async()=>(await read(a)).status.peers===1&&(await read(b)).status.peers===1);await sync(a,b);
  let sa=await read(a),sb=await read(b);
  check('Two isolated clients own distinct IDs and exactly one remote each',sa.status.playerId!==sb.status.playerId&&sa.remoteRoots===1&&sb.remoteRoots===1&&sa.canvases===1&&sb.canvases===1);
  check('Nicknames are assigned to the correct remote',sa.remotes[0].nickname==='Игрок Б'&&sb.remotes[0].nickname==='Игрок А');
  const localB=sb.local.position,localA=sa.local.position;
  const walkSamples=[];
  await a.keyboard.down('KeyW');for(let i=0;i<6;i++){await step(a,6);await step(b,3);walkSamples.push((await read(b)).remotes[0]?.stride??0);await wait(60);}await a.keyboard.up('KeyW');
  await step(a,1);await sync(a,b,700);sa=await read(a);sb=await read(b);
  check('A keyboard moves only A local controller',distance(sa.local.position,localA)>.7&&distance(sb.local.position,localB)<1e-9);
  check('B sees A position and direction through WebSocket',distance(sb.remotes[0].position,sa.local.position)<.05
    &&Math.abs(Math.atan2(Math.sin(sb.remotes[0].yaw-sa.local.yaw),Math.cos(sb.remotes[0].yaw-sa.local.yaw)))<.05);
  check('Remote walking animation advances only while peer moves',Math.max(...walkSamples)>.01&&sb.remotes[0].stride<.1);report.walkSamples=walkSamples;
  await click(a,'hudToggle');await click(b,'hudToggle');await photo(a,'two-players-client-a');await photo(b,'two-players-client-b');
  await b.keyboard.down('KeyD');for(let i=0;i<5;i++){await step(b,6);await step(a,3);await wait(60);}await b.keyboard.up('KeyD');await step(b,1);await sync(a,b,700);
  const movedB=await read(b),seenB=await read(a);
  check('B independently moves; A sees B without receiving B controls',distance(movedB.local.position,localB)>.7
    &&distance(seenB.local.position,sa.local.position)<1e-9&&distance(seenB.remotes[0].position,movedB.local.position)<.05);
  // Real socket close (not a fake state change) exercises automatic reconnect.
  const sockets=await a.evaluate(()=>window.__testSockets.length);
  await a.evaluate(()=>window.__testSockets.at(-1).close());
  await until(async()=>(await read(b)).remoteRoots===0);check('Peer disappears immediately after socket disconnect',(await read(b)).status.peers===0);
  await until(async()=>await a.evaluate(()=>window.__testSockets.length)>sockets&&(await read(a)).status.phase==='connected');await sync(a,b);
  check('Automatic reconnect keeps ID and creates no duplicate', (await read(a)).status.playerId===identity&&(await read(a)).remoteRoots===1&&(await read(b)).remoteRoots===1);
  // Switch B to a real forwarding proxy with 200 ms delay each way.
  await click(b,'mpLeave');await until(async()=>(await read(a)).remoteRoots===0);
  proxy=await delayedServer(endpoint,200);const delayed=`ws://127.0.0.1:${proxy.address().port}`;
  await b.locator('#mpServer').fill(delayed+'/ws');await b.locator('#mpCode').fill(roomId);await b.locator('#mpNickname').fill('Игрок Б');await click(b,'mpJoin');
  await until(async()=>(await read(b)).status.phase==='connected');await sync(a,b,700);
  const beforeLag=await read(b);await a.keyboard.down('KeyD');
  const samples=[];for(let i=0;i<8;i++){await step(a,4);await step(b,2);samples.push((await read(b)).remotes[0]?.position);await wait(60);}await a.keyboard.up('KeyD');await step(a,1);
  await sync(a,b,900);sa=await read(a);sb=await read(b);
  check('Delayed real WebSocket link converges without extra avatars',distance(sb.remotes[0].position,sa.local.position)<.08&&sb.remoteRoots===1&&sa.remoteRoots===1);
  check('Delayed peer is interpolated across intermediate positions',samples.filter(Boolean).some(p=>distance(p,beforeLag.remotes[0].position)>.02)
    &&samples.filter(Boolean).some(p=>distance(p,sa.local.position)>.1));report.latency={oneWayMs:200,samples,finalLocal:sa.local.position,finalRemote:sb.remotes[0].position};
  // Actual shared ride, keeping B behind the real 200 ms forwarding proxy.
  const gla='parked-mercedes-gla-x156';
  await a.evaluate(id=>window.__approachSeat(id,'driver'),gla);await sync(a,b,300);
  await a.keyboard.press('KeyE');await step(a,1);
  check('E request does not grant driver before server confirmation',!(await read(a)).drive);
  await sync(a,b,700);
  check('A receives the server-owned driver seat',(await read(a)).drive&&(await scene(b)).seats[18].seats[0].occupiedBy===identity,JSON.stringify({a:await read(a),message:(await scene(a)).seatMessage}));
  await b.evaluate(id=>window.__approachSeat(id,'front-passenger'),gla);await sync(a,b,450);await b.keyboard.press('KeyE');await sync(a,b,1100);
  check('B joins the same GLA as passenger with no driver controller',(await read(b)).local.mode==='passenger'&&!(await read(b)).drive
    &&(await scene(a)).seats[18].seats[1].occupiedBy===(await read(b)).status.playerId);
  const passengerBefore=(await scene(b)).camera;await b.keyboard.press('KeyC');await step(b,1);
  check('Passenger owns an independent seated camera',distance((await scene(b)).camera.position,passengerBefore.position)>1);
  const beforeRide=(await scene(a)).parked[18].position;
  await b.keyboard.down('KeyW');await b.keyboard.down('KeyA');await b.keyboard.press('KeyR');await sync(a,b,400);await b.keyboard.up('KeyW');await b.keyboard.up('KeyA');
  check('Passenger WASD and R cannot move/reset the car',distance((await scene(a)).parked[18].position,beforeRide)<1e-8&&!(await read(b)).drive);
  report.rideFrames=[];
  await a.keyboard.down('KeyW');
  for(let i=0;i<12;i++){
    if(i===5)await a.keyboard.down('KeyA');await step(a,4);await step(b,4);await wait(70);
    if([4,11].includes(i)){const state=await scene(a);report.rideFrames.push({phase:'forward',car:state.parked[18],wheels:state.wheels[18]});
      const name='shared-motion-'+i;await a.evaluate(()=>window.__rideView());await a.screenshot({path:out+'/'+name+'.png',timeout:120000});report.screenshots.push(name+'.png');}
  }
  await a.keyboard.up('KeyW');await a.keyboard.up('KeyA');
  let driven=await scene(a);check('Confirmed driver physically accelerates and turns the GLA',distance(driven.parked[18].position,beforeRide)>.4&&driven.wheels[18][0].angle>0
    &&Math.abs(driven.wheels[18][0].steer)>.01);
  await a.keyboard.down('Space');await a.keyboard.down('KeyA');
  const rearStart=driven.wheels[18][2].angle,frontStart=driven.wheels[18][0].angle;
  for(let i=0;i<4;i++){await step(a,4);await step(b,4);await wait(70);}await a.keyboard.up('KeyA');
  driven=await scene(a);check('Handbrake locks the rear while front wheels keep rolling',Math.abs(driven.wheels[18][2].angle-rearStart)<1e-8&&driven.wheels[18][0].angle>frontStart);
  for(let i=0;i<45&&(await scene(a)).drive.speed>.2;i++){await step(a,4);await step(b,4);await wait(65);}await a.keyboard.up('Space');await sync(a,b,1000);
  let remoteCar=await scene(b);driven=await scene(a);
  check('Both browsers converge on the same car pose and wheel distances',distance(driven.parked[18].position,remoteCar.parked[18].position)<.08
    &&Math.abs(driven.wheels[18][0].angle-remoteCar.wheels[18][0].angle)<.15);
  const passengerPosition=remoteCar.seats[18].seats[1].position;
  check('Passenger follows its exact seat through turning and drift',distance((await read(b)).local.position,passengerPosition)<1e-6
    &&distance((await read(a)).remotes[0].position,(await scene(a)).seats[18].seats[1].position)<1e-6);
  for(const [page,name] of [[a,'shared-ride-driver'],[b,'shared-ride-passenger']]){
    await page.evaluate(()=>window.__rideView());await page.screenshot({path:out+'/'+name+'.png',timeout:120000});report.screenshots.push(name+'.png');}
  await b.evaluate(()=>document.querySelector('#day').click());await step(b,2,true);
  check('Remote occupied car keeps its lightweight night headlights',(await scene(b)).headlights.some(h=>h.vehicleId===gla&&h.visible));
  await b.evaluate(()=>window.__rideView());await b.screenshot({path:out+'/shared-ride-night.png',timeout:120000});report.screenshots.push('shared-ride-night.png');
  await b.evaluate(()=>document.querySelector('#day').click());await step(b,2);
  const forwardAngle=driven.wheels[18][0].angle;
  await a.keyboard.down('KeyS');for(let i=0;i<7;i++){await step(a,4);await step(b,4);await wait(70);}await a.keyboard.up('KeyS');await sync(a,b,500);
  check('Reverse is shared and reverses wheel rotation',(await scene(a)).wheels[18][0].angle<forwardAngle&&(await scene(b)).drive.active===false);
  await a.keyboard.down('Space');for(let i=0;i<35&&Math.abs((await scene(a)).drive.speed)>.15;i++){await step(a,4);await step(b,4);await wait(65);}await a.keyboard.up('Space');await sync(a,b,800);
  // Disconnect the real driver socket while B remains seated.
  const rideSockets=await a.evaluate(()=>window.__testSockets.length);await a.evaluate(()=>window.__testSockets.at(-1).close());
  await until(async()=>(await read(b)).status.peers===0);await sync(a,b,150);
  check('Driver disconnect freezes agreed car and preserves passenger seat',Math.abs((await read(b)).fleet.vehicles[18].state.speed)<1e-9&&(await read(b)).local.mode==='passenger');
  await until(async()=>await a.evaluate(()=>window.__testSockets.length)>rideSockets&&(await read(a)).status.phase==='connected');await sync(a,b,1000);
  check('Driver reconnect restores one driver and one passenger without duplicates',(await read(a)).drive&&(await read(b)).local.mode==='passenger'
    &&(await scene(a)).seats.flatMap(v=>v.seats).filter(s=>s.occupiedBy===identity).length===1);
  const passengerIdentity=(await read(b)).status.playerId,passengerSockets=await b.evaluate(()=>window.__testSockets.length);
  await b.evaluate(()=>window.__testSockets.at(-1).close());await until(async()=>(await read(a)).status.peers===0);
  check('Passenger disconnect reserves only its existing seat',(await scene(a)).seats[18].seats[1].occupiedBy===passengerIdentity&&(await read(a)).drive);
  await until(async()=>await b.evaluate(()=>window.__testSockets.length)>passengerSockets&&(await read(b)).status.phase==='connected');await sync(a,b,1000);
  check('Passenger reconnect restores the same seat without driving rights',(await read(b)).status.playerId===passengerIdentity&&(await read(b)).local.mode==='passenger'&&!(await read(b)).drive
    &&(await scene(a)).seats.flatMap(v=>v.seats).filter(s=>s.occupiedBy===passengerIdentity).length===1);
  await b.keyboard.press('KeyE');await sync(a,b,1100);check('Passenger safely exits through server-confirmed door',(await read(b)).local.mode==='onFoot');
  await a.keyboard.press('KeyE');await sync(a,b,800);check('Driver exits without resetting the car',(await read(a)).local.mode==='onFoot'&&distance((await scene(a)).parked[18].position,beforeRide)>.2);
  await a.evaluate(()=>window.__approachSeat('parked-golf-red','driver'));await sync(a,b,350);await a.keyboard.press('KeyE');await sync(a,b,800);
  check('Switching cars preserves GLA and grants a different stable vehicle ID',(await scene(a)).player.vehicleId==='parked-golf-red'&&(await scene(b)).seats[2].seats[0].occupiedBy===identity);
  await a.keyboard.press('KeyE');await sync(a,b,800);
  for(const page of [a,b])await page.evaluate(()=>window.__approachSeat('parked-00','driver'));await sync(a,b,500);
  await Promise.all([a.keyboard.press('KeyE'),b.keyboard.press('KeyE')]);await sync(a,b,1200);
  const contenders=[await read(a),await read(b)],winner=contenders.findIndex(s=>s.local.mode==='driver');
  check('Concurrent browser requests produce exactly one driver',winner>=0&&contenders.filter(s=>s.local.mode==='driver').length===1
    &&(await scene(a)).seats[0].seats[0].occupiedBy===(await scene(b)).seats[0].seats[0].occupiedBy);
  const loser=[a,b][1-winner];check('Rejected seat keeps loser walking with readable occupancy feedback',(await read(loser)).local.mode==='onFoot'&&(await scene(loser)).seatMessage.includes('занято'));
  await [a,b][winner].keyboard.press('KeyE');await sync(a,b,1000);
  report.allVehicleDrives=[];
  for(const [index,entry] of (await scene(a)).seats.entries()){
    const id=entry.vehicleId;
    await a.evaluate(id=>window.__approachSeat(id,'driver'),id);await sync(a,b,250);await a.keyboard.press('KeyE');await sync(a,b,650);
    const before=await scene(a);check('Network driver seat '+id,before.player.vehicleId===id&&before.drive.active);
    await a.keyboard.down('KeyW');for(let j=0;j<3;j++){await step(a,4);await step(b,4);await wait(70);}await a.keyboard.up('KeyW');
    await a.keyboard.down('Space');for(let j=0;j<15&&Math.abs((await scene(a)).drive.speed)>.12;j++){await step(a,4);await step(b,4);await wait(70);}await a.keyboard.up('Space');await sync(a,b,800);
    const driven=await scene(a),seen=await scene(b),motion=distance(before.parked[index].position,driven.parked[index].position);
    check('Network movement and real wheel rotation '+id,motion>.015&&Math.abs(driven.wheels[index][0].angle-before.wheels[index][0].angle)>.02
      &&distance(driven.parked[index].position,seen.parked[index].position)<.08);
    report.allVehicleDrives.push({vehicleId:id,before:before.parked[index],after:driven.parked[index],peer:seen.parked[index],wheelBefore:before.wheels[index][0].angle,wheelAfter:driven.wheels[index][0].angle});
    await a.keyboard.press('KeyE');await sync(a,b,700);check('Network safe exit '+id,(await read(a)).local.mode==='onFoot');
  }
  const agreedFleet=(await scene(a)).parked.map(v=>v.position);
  await click(b,'mpLeave');await sync(a,b,500);await click(b,'mpJoin');await until(async()=>(await read(b)).status.phase==='connected');await sync(a,b,1100);
  check('Late join adopts every moved car pose without cloning models',(await scene(b)).parked.every((v,i)=>distance(v.position,agreedFleet[i])<.08)
    &&(await read(b)).remoteRoots===1&&(await read(b)).fleet.vehicles.length===19);
  // Pause local simulation for stable resource counts; networking remains active.
  await a.evaluate(()=>document.querySelector('#pause').click());await b.evaluate(()=>document.querySelector('#pause').click());await sync(a,b,400);
  const activeResources=[(await scene(a)).resources,(await scene(b)).resources];
  for(let i=0;i<3;i++){
    const count=await a.evaluate(()=>window.__testSockets.length);await a.evaluate(()=>window.__testSockets.at(-1).close());
    await until(async()=>await a.evaluate(()=>window.__testSockets.length)>count&&(await read(a)).status.phase==='connected');await sync(a,b,600);
    const currentResources=[(await scene(a)).resources,(await scene(b)).resources];
    report.reconnectResources??=[];report.reconnectResources.push(currentResources);
    check('Reconnect cycle '+i+' keeps one remote and stable resources',(await read(a)).remoteRoots===1&&(await read(b)).remoteRoots===1
      &&['sceneGeometries','sceneMaterials','sceneTextures'].every(key=>
        currentResources[0][key]===activeResources[0][key]&&currentResources[1][key]===activeResources[1][key]));
  }
  check('Network mode disables legacy drive and camera preset buttons',await a.locator('#drive').isDisabled()&&await a.locator('#map').isDisabled());
  await a.evaluate(()=>document.querySelector('#pause').click());
  await a.evaluate(()=>window.__approachSeat('parked-mercedes-gla-x156','driver'));await a.keyboard.press('KeyE');await step(a,1);await sync(a,b,600);
  check('Physical E waits for server-confirmed seat and starts the driver',(await read(a)).drive&&(await read(a)).local.mode==='driver'
    &&(await scene(b)).seats[18].seats[0].occupiedBy===identity,JSON.stringify({a:await read(a),message:(await scene(a)).seatMessage}));
  await a.keyboard.press('KeyE');await sync(a,b,600);
  check('Server-confirmed E exit restores walking',(await read(a)).local.mode==='onFoot'&&!(await read(a)).drive);
  await a.evaluate(()=>document.querySelector('#pause').click());
  await click(a,'mpLeave');await click(b,'mpLeave');await sync(a,b,500);
  const endA=(await scene(a)).resources,endB=(await scene(b)).resources;
  check('Leaving clears remote/label resources and restores local identity',(await read(a)).remoteRoots===0&&(await read(b)).remoteRoots===0
    &&(await read(a)).local.playerId==='local-player'&&endA.sceneGeometries===baseA.sceneGeometries
    &&endA.sceneTextures===baseA.sceneTextures&&endB.sceneMaterials===baseB.sceneMaterials);
  check('Network never reloads any of the four car GLBs',JSON.stringify(endA.models)===JSON.stringify(baseA.models)&&JSON.stringify(endB.models)===JSON.stringify(baseB.models));
  report.resources={baseA,baseB,active:activeResources,endA,endB};
  // XSS is checked on the actual DOM; nickname is not interpreted as markup.
  await a.locator('#mpNickname').fill('<img src=x>');await click(a,'mpCreate');await until(async()=>(await read(a)).status.phase==='connected');await step(a,1);
  check('Nickname markup stays literal text, never DOM elements',(await a.locator('#mpIdentity').textContent()).includes('<img src=x>')&&await a.locator('#mpIdentity img').count()===0);
  await click(a,'mpLeave');
  await a.locator('#mpCode').fill('abcdefghijklmnop');await click(a,'mpJoin');
  await until(async()=>(await read(a)).status.phase==='error');await step(a,1);
  check('Real server refusal produces a readable error indicator',(await a.locator('#mpStatus').textContent()).includes('Комната не найдена')
    &&(await read(a)).remoteRoots===0);
  await click(a,'mpLeave');
  await a.evaluate(()=>document.querySelector('#pause').click());
  await a.evaluate(()=>window.__approachSeat('parked-mercedes-gla-x156','driver'));await a.keyboard.press('KeyE');await step(a,1);
  check('Single-player physical GLA driving is restored after leaving',(await read(a)).drive&&(await read(a)).local.mode==='driver');
  await a.keyboard.down('KeyW');await step(a,30);await a.keyboard.up('KeyW');check('Single-player GLA still moves and rolls wheels',(await scene(a)).wheels[18].every(w=>w.angle>0));
  const connections=await a.evaluate(()=>window.__testSockets.length);await click(a,'mpCreate');
  check('Joining while driving refuses without changing seats or opening a socket',(await read(a)).drive&&(await read(a)).local.mode==='driver'
    &&await a.evaluate(()=>window.__testSockets.length)===connections&&(await a.locator('#mpStatus').textContent()).includes('выйдите'));
  check('No browser/server errors or dialogs',report.errors.length===0,report.errors.join(' | '));report.ok=true;
} catch(error) {
  report.lastStates=[];for(const context of browser?.contexts()??[])for(const page of context.pages())try{report.lastStates.push({network:await read(page),scene:await scene(page)});}catch{}
  report.errors.push(String(error.stack??error));console.error(error);process.exitCode=1;}
finally {
  await browser?.close();for(const ws of proxySockets)ws.terminate();
  if(proxy)await new Promise(done=>proxy.close(done));if(http)await new Promise(done=>http.close(done));
  if(child&&child.exitCode===null){const closed=new Promise(done=>child.once('exit',done));child.kill();await closed;}
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(report.checks.filter(c=>c.ok).length+'/'+report.checks.length+' checks; ok='+report.ok);
}
