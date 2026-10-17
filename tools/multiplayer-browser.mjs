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
  camera.lookAt(controls.target);renderer.render(scene,camera);};`;
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
    if(file.endsWith('/src/network/remotePlayers.js'))return code.replace('now=()=>performance.now()','now=()=>window.__networkClock()');
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
  await a.evaluate(()=>window.__approachSeat('parked-mercedes-gla-x156','driver'));await a.keyboard.press('KeyE');await step(a,1);
  check('Physical E cannot claim a car while in the room',!(await read(a)).drive&&(await read(a)).local.mode==='onFoot'
    &&(await scene(a)).seats.every(v=>v.seats.every(s=>s.occupiedBy===null)));
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
} catch(error) {report.errors.push(String(error.stack??error));console.error(error);process.exitCode=1;}
finally {
  await browser?.close();for(const ws of proxySockets)ws.terminate();
  if(proxy)await new Promise(done=>proxy.close(done));if(http)await new Promise(done=>http.close(done));
  if(child&&child.exitCode===null){const closed=new Promise(done=>child.once('exit',done));child.kill();await closed;}
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(report.checks.filter(c=>c.ok).length+'/'+report.checks.length+' checks; ok='+report.ok);
}
