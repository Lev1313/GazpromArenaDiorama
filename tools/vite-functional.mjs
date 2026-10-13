/** Browser integration tests. Uses an instrumented production build, never edits src. */
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'browser-tests/_current');
const report = { ok: false, checks: [], errors: [], screenshots: [],
  generatedAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  mode: 'Production bundle with snapshot and pedestrian start-position fixtures; manual 60 Hz clock; Edge SwiftShader' };

// Only the private test build receives this observation hook. No mutable object
// references or controller methods escape through the snapshot; movement inputs
// use the actual DOM/UI. A separate pedestrian fixture only sets test start poses.
const observation = `
window.__readDiorama = () => {
  const pose = o => ({ position: o.position.toArray(), yaw: o.rotation.y, visible: o.visible });
  return JSON.parse(JSON.stringify({
    hud: hud.state, golf: pose(golf), home: drive.golfHome.toArray(),
    pedestrian: { ...pose(pedestrian.model), ...pedestrian.state, keys: [...pedestrian.keys],
      blocked: Boolean(pedestrian.collision(pedestrian.model.position.x,pedestrian.model.position.z)),
      legAngle: pedestrian.model.children[0].children[4].rotation.x },
    parked: parked.map(c=>({...pose(c),footprint:c.userData.footprint})),
    player: seating.serialize(),
    golfBlocking:seating.golfBlocksTraffic(),
    seats: vehicleRegistry.vehicles.map(v=>({vehicleId:v.vehicleId,canDrive:v.canDrive,
      seats:v.seats.map(s=>({seatId:s.seatId,role:s.role,occupiedBy:s.occupiedBy,
        entry:vehicleRegistry.worldPosition(v,s).toArray(),
        position:vehicleRegistry.worldPosition(v,s,'localPosition').toArray()}))})),
    seatMessage:seating.getStatus().message,
    drive: drive.state, keys: [...drive.keys], status: drive.getStatus(),
    camera: { position: camera.position.toArray(), target: controls.target.toArray(),
      aspect: camera.aspect, enabled: controls.enabled },
    lighting: { background: scene.background.getHex(), fog: scene.fog.color.getHex(),
      hemi: hemi.intensity, sun: sun.intensity, exposure: renderer.toneMappingExposure },
    highCars: traffic.highCars.map(c => ({ ...pose(c.o), t: c.t })),
    visitors: traffic.visitors.map(c => ({ ...pose(c.o), state:c.state, t:c.t, wait:c.wait, delay:c.delay })),
    parkedVisitors: traffic.parkedVisitorCount,
    drift: { time: drift.driftTime, simTime: drift.simTime, waiting: drift.driftWaiting,
      cars: drift.drifters.map(c => pose(c.o)), skidCount: drift.skidCount,
      skidCapacity: drift.skidCapacity, skidArrayLength: drift.skidPositions.length,
      smokeEnabled: drift.smokeEnabled, smokePoolSize: drift.smokePool.length,
      smokeVisible: drift.smokePool.filter(p => p.o.visible).length },
    counts: { parked: parked.length, people: people.length, children: scene.children.length },
    canvas: { width: canvas.width, height: canvas.height }, stats: hud.getStats()
  }));
};
// Test fixture placement only; normal builds have neither observation nor fixture hooks.
window.__placePedestrian = (x,z) => {
  if(pedestrian.collision(x,z)) throw new Error('Unsafe browser fixture');
  pedestrian.clearKeys(); pedestrian.model.position.set(x,-.12,z);
  pedestrian.state.cameraYaw=0; pedestrian.updateCamera(1,true);
};
window.__approachSeat = (id,seatId) => {
  if(seating.isSeated()) throw new Error('Fixture requires on foot');
  const point=vehicleRegistry.worldPosition(id,seatId);
  if(!point || !pedestrian.resumeAt(point)) throw new Error('Unsafe door fixture');
};
const originalPedestrianCollision=pedestrian.collision;
window.__blockSeatExit = value => { pedestrian.collision=value?()=>true:originalPedestrianCollision; };
window.__occupySeat = (id,seatId,occupied) => occupied ? vehicleRegistry.claim(id,seatId,'fixture-player')
  : vehicleRegistry.release(id,seatId,'fixture-player');`;

function clock() {
  let time = 0, token = 0, gl;
  const queue = new Map();
  performance.now = () => time;
  window.requestAnimationFrame = callback => { queue.set(++token, callback); return token; };
  window.cancelAnimationFrame = id => queue.delete(id);
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, attrs) {
    const context = original.call(this, kind, attrs);
    if (context && /webgl/.test(kind)) gl = context;
    return context;
  };
  let skip = false;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const draw = C.prototype[name];
      if (draw) C.prototype[name] = function (...args) { if (!skip) return draw.apply(this, args); };
    }
  }
  window.__step = (frames, renderLast = true) => {
    for (let i = 0; i < frames; i++) {
      skip = !renderLast || i < frames - 1;
      time += 1000 / 60;
      const callbacks = [...queue.values()]; queue.clear();
      for (const callback of callbacks) callback(time);
    }
    skip = false;
    if (renderLast) gl?.finish();
  };
  window.__functionalErrors = [];
  addEventListener('unhandledrejection', event => window.__functionalErrors.push(String(event.reason)));
}
const snapshot = page => page.evaluate(() => window.__readDiorama());
const step = (page, frames = 1, renderLast = true) => page.evaluate(
  ([n, draw]) => window.__step(n, draw), [frames, renderLast]);
async function click(page, selector) { await page.click(selector); await step(page); }
async function key(page, code) { await page.keyboard.press(code); await step(page); }
const near = (a, b, tolerance = 1e-7) => Math.abs(a - b) <= tolerance;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
async function resize(page, width, height) {
  await page.setViewportSize({width,height});
  // Viewport emulation resolves before the native resize event is necessarily
  // delivered. Poll independently of our intentionally frozen RAF clock.
  await page.waitForFunction(([w,h])=>{
    const s=window.__readDiorama();
    return s.canvas.width===w && s.canvas.height===h && Math.abs(s.camera.aspect-w/h)<1e-7;
  },[width,height],{polling:50,timeout:10000});
  await step(page,2);
}
function check(name, condition, detail = '') {
  report.checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  assert(condition, name + (detail ? ': ' + detail : ''));
}
async function shot(page, name) {
  await step(page);
  await page.screenshot({ path: join(out, name + '.png'), timeout: 120000 });
  report.screenshots.push(name + '.png');
}

async function sceneTests(page) {
  let a = await snapshot(page);
  check('Initial scene counts and unique controls', a.counts.parked === 18 && a.counts.people === 32
    && a.highCars.length === 14 && a.visitors.length === 3 && a.drift.cars.length === 2
    && await page.locator('#drive').count() === 1 && await page.locator('#full-hud').count() === 1);
  check('Initial stats are rendered', await page.locator('#stats').textContent() === a.stats);
  await step(page, 120);
  let b = await snapshot(page);
  check('Highway vehicles actually move', distance(a.highCars[0].position, b.highCars[0].position) > 1);
  check('Both drifters move, emit smoke and leave tire marks', b.drift.cars.every((c, i) =>
    distance(c.position, a.drift.cars[i].position) > 1) && b.drift.smokeVisible > 0 && b.drift.skidCount > 0);
  await click(page, '#pause'); a = await snapshot(page);
  await step(page, 120); b = await snapshot(page);
  check('Pause freezes traffic, visitors, drift and effects', !b.hud.running && same(a.highCars, b.highCars)
    && same(a.visitors, b.visitors) && same(a.drift, b.drift));
  const presets = {
    meet: [[-20,64,64],[-8,0,0]], arena: [[3,29,54],[50,9,0]],
    high: [[-85,95,95],[-27,12,-17]], map: [[0,230,-23.99],[0,0,-24]],
    drift: [[-9,44,37],[-8,1,0]], reset: [[-115,150,190],[-4,12,-25]],
  };
  for (const [id, [position, target]] of Object.entries(presets)) {
    await click(page, '#' + id); b = await snapshot(page);
    check('Camera preset ' + id, distance(b.camera.position, position) < .001 && distance(b.camera.target, target) < .001);
  }
  a = await snapshot(page);
  await page.mouse.move(800,500); await page.mouse.down();
  await page.mouse.move(950,450,{steps:8}); await page.mouse.up(); await step(page,60);
  b = await snapshot(page);
  check('Orbit mouse drag rotates camera while paused', distance(a.camera.position,b.camera.position)>1);
  await page.mouse.wheel(0,-300); await step(page,60); a = await snapshot(page);
  check('Mouse wheel zooms camera', Math.abs(distance(a.camera.position,a.camera.target)-distance(b.camera.position,b.camera.target))>1);
  await click(page,'#reset');
  await click(page,'#day'); b=await snapshot(page);
  check('Day updates actual sky, fog, light and exposure', b.lighting.background===0x91c5e4
    && b.lighting.fog===0x91c5e4 && b.lighting.hemi===3 && b.lighting.sun===4 && b.lighting.exposure===1.25);
  await click(page,'#day'); b=await snapshot(page);
  check('Night restores dim moon lighting', b.lighting.background===0x101725
    && b.lighting.fog===0x101725 && b.lighting.hemi===.4 && b.lighting.sun===.65 && b.lighting.exposure===1.15);
  await click(page,'#smoke'); b=await snapshot(page);
  check('Smoke off hides actual particles', !b.drift.smokeEnabled && b.drift.smokeVisible===0);
  await click(page,'#pause'); await step(page,60); b=await snapshot(page);
  check('Resume advances simulation while disabled smoke stays hidden', b.hud.running && b.drift.smokeVisible===0);
  await click(page,'#smoke'); await step(page,30); b=await snapshot(page);
  check('Smoke emission resumes', b.drift.smokeEnabled && b.drift.smokeVisible>0);
  for (const speed of [.3,1,2]) {
    await page.locator('#speed').fill(String(speed)); a=await snapshot(page);
    await step(page,60); b=await snapshot(page);
    check('Tempo '+speed+' changes simulation time and traffic rate', near(b.drift.simTime-a.drift.simTime,speed)
      && near((b.highCars[0].t-a.highCars[0].t+1)%1,.025*speed));
  }
  await page.locator('#speed').fill('1');
  await click(page,'#hudToggle');
  check('Photo sources removed; main interface hides and restores', await page.locator('#photoSources').count()===0
    && !await page.locator('#full-hud').isVisible() && await page.locator('#hudToggle').isVisible());
  await key(page,'KeyH');
  assert(await page.locator('#full-hud').isVisible(), 'H did not restore the interface');
  await resize(page,1000,650); b=await snapshot(page);
  check('Desktop resize updates canvas and camera projection', b.canvas.width===1000 && b.canvas.height===650 && near(b.camera.aspect,1000/650));
  await shot(page,'desktop-controls');
}

async function trafficTests(page) {
  await click(page,'#day');
  await click(page,'#map');
  const initial=await snapshot(page), states=new Set(); let counted=false, completed=false;
  for(let second=0;second<240;second++) {
    await step(page,60,false);
    const s=await snapshot(page), guest=s.visitors[0]; states.add(guest.state);
    if ([2,30,65,100].includes(second)) await shot(page,'visitor-route-'+second);
    checkStats(s, await page.locator('#stats').textContent());
    if(s.parkedVisitors>0) counted=true;
    if(states.has('leave') && guest.state==='arrive' && !guest.visible && guest.delay>0) {completed=true;break;}
  }
  check('Visitor arrives, parks, reverses, departs and hides before next visit', states.has('arrive') && states.has('park') && states.has('reverse') && states.has('leave') && completed);
  check('Live parking counter follows actual visitor states', counted);
  await step(page,60*130,false); const end=await snapshot(page);
  check('Long simulation keeps smoke, skid buffers and scene size bounded', end.drift.smokePoolSize===90
    && end.drift.skidCapacity===4000 && end.drift.skidCount===4000 && end.drift.skidArrayLength===24000
    && end.counts.children===initial.counts.children);
  await shot(page,'traffic-long-run');
}
function checkStats(s, text) {
  assert.equal(text, `Дрифт: 2 авто · на парковке: ${18-Number(s.drive.active)+s.parkedVisitors} · зрителей: 32`);
}

async function accelerate(page) {
  for(let attempt=0;attempt<12;attempt++) {
    await page.keyboard.down('KeyW'); await step(page,45);
    const s=await snapshot(page);
    if(s.drive.speed>3) return s;
    await page.keyboard.up('KeyW'); await key(page,'KeyR'); await step(page,60);
  }
  throw new Error('Golf failed to accelerate after deterministic retries');
}
async function driveTests(page) {
  await click(page,'#pause'); const overview=await snapshot(page);
  await click(page,'#drive'); let s=await snapshot(page);
  check('Entering Golf enables drive HUD and updates counter', s.drive.active && !s.camera.enabled
    && await page.locator('#drivePanel').isVisible() && await page.locator('#meet').isHidden());
  checkStats(s,await page.locator('#stats').textContent());
  await page.keyboard.down('KeyW'); await step(page,60); const frozen=await snapshot(page);
  check('Pause also freezes Golf position and speed', same(frozen.golf,s.golf) && frozen.drive.speed===0);
  await click(page,'#pause');
  check('Resume clears held driving keys', (await snapshot(page)).keys.length===0);
  await page.keyboard.up('KeyW');
  for (const [index,name] of [[1,'Сверху'],[2,'Свободно'],[0,'Сзади']]) {
    await key(page,'KeyC'); s=await snapshot(page);
    check('Golf camera '+name, s.drive.view===index && s.camera.enabled===(index===2)
      && await page.locator('#viewName').textContent()===name);
  }
  const fast=await accelerate(page);
  check('W accelerates and physically moves Golf', fast.status.speedKmh>10 && fast.status.gear==='D'
    && distance(fast.golf.position,fast.home)>.5);
  await page.keyboard.down('KeyA'); await step(page,8); s=await snapshot(page);
  check('A steers left and changes heading', s.drive.steer>0 && Math.abs(s.golf.yaw-fast.golf.yaw)>.001);
  await page.keyboard.up('KeyA'); await page.keyboard.down('KeyD'); await step(page,20); s=await snapshot(page);
  check('D steers right', s.drive.steer<0);
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW'); await key(page,'KeyR');
  const brakingStart=await accelerate(page);
  await page.keyboard.up('KeyW'); await page.keyboard.down('Space'); await step(page,5); s=await snapshot(page);
  check('Space reduces speed and writes Golf skid segments', s.drive.speed<brakingStart.drive.speed
    && s.drive.lastRear!==null && s.drift.skidCount>brakingStart.drift.skidCount);
  await step(page,60); await page.keyboard.up('Space'); s=await snapshot(page);
  check('Brake stops Golf', s.drive.speed===0 && s.status.gear==='N');
  await key(page,'KeyR'); await page.keyboard.down('KeyW');
  let collided=false;
  for(let i=0;i<80;i++) {
    await step(page,10,false); s=await snapshot(page);
    if(s.drive.contact>0 && s.drive.speed===0) {collided=true;break;}
  }
  await page.keyboard.up('KeyW');
  check('Obstacle collision stops Golf and displays warning', collided && s.status.message==='Препятствие — сдай назад');
  const collisionPosition=s.golf.position;
  await page.keyboard.down('KeyS'); await step(page,30); s=await snapshot(page); await page.keyboard.up('KeyS');
  check('S reverses away from obstacle', s.drive.speed<0 && s.status.gear==='R' && distance(s.golf.position,collisionPosition)>.1);
  await key(page,'KeyR'); s=await snapshot(page);
  check('R restores home pose, speed and steering', same(s.golf.position,s.home) && s.drive.speed===0 && s.drive.steer===0 && s.keys.length===0);
  for (const code of ['ArrowUp','ArrowLeft','ArrowDown','ArrowRight']) {
    await page.keyboard.down(code); await step(page,2); s=await snapshot(page);
    check('Arrow key reaches driving controller: '+code,s.keys.includes(code));
    await page.keyboard.up(code);
  }
  await key(page,'KeyR');
  await page.keyboard.down('KeyW');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await step(page,30); s=await snapshot(page);
  check('Blur handler clears throttle without stuck acceleration',s.keys.length===0 && s.drive.speed===0);
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyW');
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
  });
  await step(page,30); s=await snapshot(page);
  check('Hidden-document handler clears driving keys',s.keys.length===0 && s.drive.speed===0);
  await page.keyboard.up('KeyW');
  // A real focused input tests the DOM key guard; no controller methods called.
  await page.evaluate(()=>{const input=document.createElement('input');input.id='test-input';document.body.append(input);input.focus();});
  await page.keyboard.down('KeyW'); await step(page,10); s=await snapshot(page);
  check('Typing in input does not accelerate Golf',s.keys.length===0 && s.drive.speed===0);
  await page.keyboard.up('KeyW'); await page.evaluate(()=>document.querySelector('#test-input').remove());
  await shot(page,'golf-functional');
  await key(page,'Escape'); s=await snapshot(page);
  check('Esc restores overview, car and scene HUD',!s.drive.active && s.camera.enabled
    && distance(s.camera.position,overview.camera.position)<.001 && distance(s.camera.target,overview.camera.target)<.001
    && same(s.golf.position,s.home) && await page.locator('#drivePanel').isHidden() && await page.locator('#meet').isVisible());
  // Golf physics must be independent of the scene-tempo slider.
  const speeds=[];
  for(const tempo of [.3,2]) {
    await page.locator('#speed').fill(String(tempo)); await click(page,'#drive');
    await page.keyboard.down('KeyW'); await step(page,10); s=await snapshot(page); speeds.push(s.drive.speed);
    await page.keyboard.up('KeyW'); await click(page,'#driveExit');
  }
  check('Scene tempo does not scale Golf acceleration',speeds[0]>0 && near(speeds[0],speeds[1]),speeds.join(' / '));
}

async function mobileTests(page, context) {
  await click(page,'#drive');
  check('Mobile pedals visible',await page.locator('.touchControls').isVisible());
  const cdp=await context.newCDPSession(page);
  const point=async code=>{const b=await page.locator(`[data-drive-key="${code}"]`).boundingBox();assert(b);return{x:b.x+b.width/2,y:b.y+b.height/2};};
  const gas=await point('KeyW'),left=await point('KeyA');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:0}]});
  await step(page,20); let s=await snapshot(page);
  check('Real touch throttle accelerates Golf',s.keys.includes('KeyW') && s.drive.speed>0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...gas,id:0},{...left,id:1}]});
  await step(page,10); s=await snapshot(page);
  check('Multitouch gas and steering work together',s.keys.includes('KeyW') && s.keys.includes('KeyA') && s.drive.steer>0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await step(page);
  check('Touch release clears both keys',(await snapshot(page)).keys.length===0);
  await page.tap('#driveReset'); await step(page);
  const reverse=await point('KeyS');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...reverse,id:0}]});
  await step(page,10); s=await snapshot(page);
  check('Mobile reverse pedal selects reverse gear',s.drive.speed<0 && s.status.gear==='R');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); await step(page);
  check('Touch cancellation releases captured key',(await snapshot(page)).keys.length===0);
  await page.tap('#driveReset'); await step(page); await page.tap('#driveCamera'); await step(page);
  check('Mobile camera button switches to overhead',(await snapshot(page)).drive.view===1);
  await shot(page,'mobile-touch');
  await resize(page,844,390); s=await snapshot(page);
  check('Mobile landscape resize updates render dimensions',s.canvas.width===844 && s.canvas.height===390 && near(s.camera.aspect,844/390));
  await page.tap('#driveExit'); await step(page);
  check('Mobile exit hides pedals and restores scene',!(await snapshot(page)).drive.active && await page.locator('.touchControls').isHidden());
  await cdp.detach();
}

async function pedestrianTests(page) {
  const read=async()=> (await snapshot(page)).pedestrian;
  const press=async(code,frames)=>{await page.keyboard.down(code);await step(page,frames);await page.keyboard.up(code);};
  await click(page,'#day');
  const overview=(await snapshot(page)).camera;
  await click(page,'#walk');let a=await read();
  check('Walk enters at a clear parking point with third-person camera',a.active && a.visible && !a.blocked
    && !(await snapshot(page)).camera.enabled && !(await snapshot(page)).drive.active);
  await shot(page,'pedestrian-day');
  await press('KeyW',60);let b=await read();
  check('W walks through parking lane and animates legs',a.position[2]-b.position[2]>2 && b.stride>.9 && b.phase>0 && !b.blocked);
  a=b;await page.keyboard.down('Shift');await press('KeyS',60);await page.keyboard.up('Shift');b=await read();
  check('Shift increases walking pace',b.position[2]-a.position[2]>3.3);
  await click(page,'#pause');a=await read();await page.keyboard.down('w');await step(page,120);await page.keyboard.up('w');b=await read();
  check('Pause freezes position and animation; paused input is ignored',same(a,b));
  await click(page,'#pause');await step(page,30);b=await read();
  check('Resume has no stuck movement key',distance(a.position,b.position)<1e-7 && b.keys.length===0);
  // Each GLB fixture starts just outside its measured footprint. Movement is
  // real keyboard input; the test places only the initial clear point.
  for(const [index,name] of [[2,'Golf'],[17,'Lexus'],[16,'Mercedes']]) {
    const c=(await snapshot(page)).parked[index], f=c.footprint;
    const extent=Math.abs(Math.cos(c.yaw))*f.halfLength+Math.abs(Math.sin(c.yaw))*f.halfWidth;
    await page.evaluate(([x,z])=>window.__placePedestrian(x,z),[c.position[0]+extent+.8,c.position[2]]);
    await press('KeyA',120);b=await read();
    check('Walking cannot pass through actual '+name+' GLB',b.position[0]>c.position[0]+extent+.29 && b.contact && !b.blocked);
    await shot(page,'pedestrian-'+name.toLowerCase());
    // Diagonal input has a tangent component and must slide along the side.
    a=b;await page.keyboard.down('a');await press('KeyW',35);await page.keyboard.up('a');b=await read();
    check('Character slides beside '+name+' and can move away',a.position[2]-b.position[2]>.5 && !b.blocked);
  }
  await page.evaluate(()=>window.__placePedestrian(10.8,8));
  await press('KeyD',120);b=await read();
  check('Existing parking fence blocks pedestrian',b.position[0]<11.4 && b.contact && !b.blocked);
  a=b;await page.keyboard.down('d');await press('KeyS',40);await page.keyboard.up('d');b=await read();
  check('Pedestrian slides along actual parking fence',b.position[2]-a.position[2]>.7 && b.position[0]<11.4 && !b.blocked);
  await page.evaluate(()=>window.__placePedestrian(13.3,8));await press('KeyS',30);b=await read();
  check('Feet rest on actual raised footpath',near(b.position[1],-.15,1e-6) && !b.blocked);
  await page.evaluate(()=>window.__placePedestrian(88,0));
  await press('KeyD',120);b=await read();
  check('Actual island boundary stops walking into water and follows grass height',b.position[0]<88.7 && b.contact
    && !b.blocked && near(b.position[1],-.45));
  await page.evaluate(()=>window.__placePedestrian(-18,-8));
  a=(await snapshot(page)).camera;
  await page.mouse.move(800,450);await page.mouse.down();await page.mouse.move(980,450,{steps:8});await page.mouse.up();await step(page,30);
  b=await snapshot(page);
  check('Mouse rotates smooth chase camera while OrbitControls remain disabled',distance(a.position,b.camera.position)>1 && !b.camera.enabled);
  a=b.pedestrian;await press('KeyW',30);b=await read();
  check('Walking follows rotated camera direction',Math.abs(b.position[0]-a.position[0])>.3 && !b.blocked);
  await click(page,'#day');await shot(page,'pedestrian-night');
  check('Night walking preserves lighting scheme',(await snapshot(page)).lighting.sun===.65 && (await read()).visible);
  await click(page,'#walk');b=await snapshot(page);
  check('Walk exits, hides character and restores overview',!b.pedestrian.active && !b.pedestrian.visible && b.camera.enabled
    && distance(b.camera.position,overview.position)<.001 && distance(b.camera.target,overview.target)<.001);
  await click(page,'#walk');await click(page,'#arena');b=await snapshot(page);
  check('Camera preset exits walk and retains arena preset',!b.pedestrian.active && distance(b.camera.position,[3,29,54])<.001);
  await click(page,'#walk');await click(page,'#drive');b=await snapshot(page);
  check('Golf activation exits walking with exclusive input',b.drive.active && !b.pedestrian.active);
  await press('KeyW',60);b=await snapshot(page);
  check('Golf still accelerates after walking',b.drive.speed>3 && b.drive.active);
  await click(page,'#walk');b=await snapshot(page);
  check('Walking activation exits Golf and clears its input',b.pedestrian.active && !b.drive.active && b.keys.length===0);
  await page.keyboard.down('w');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await step(page);await page.keyboard.up('w');
  check('Walk blur clears held input',(await read()).keys.length===0);
  await click(page,'#walkReset');check('Walk recovery returns to a clear point',!(await read()).blocked);
  await click(page,'#walkExit');
}

async function seatingTests(page) {
  const approach=async(id,seat)=>{await page.evaluate(([v,s])=>window.__approachSeat(v,s),[id,seat]);await step(page);};
  const seatIn=(s,id,seat)=>s.seats.find(v=>v.vehicleId===id).seats.find(v=>v.seatId===seat);
  await click(page,'#day');await click(page,'#walk');
  let a=await snapshot(page);
  check('18 distinct stable vehicle identities and 72 seat records',a.seats.length===18
    && new Set(a.seats.map(v=>v.vehicleId)).size===18 && a.seats.every(v=>v.seats.length===4));
  for(const [id,name] of [['parked-golf-red','golf'],['parked-lexus-rx','lexus'],['parked-mercedes-gl','mercedes'],['parked-00','procedural']]) {
    await approach(id,'driver');
    check('Door prompt selects '+name,await page.locator('#seatPrompt').isVisible()
      && (await page.locator('#seatPrompt').textContent()).includes('E — сесть'));
    if(name!=='procedural')await shot(page,'seating-'+name+'-door');
    await key(page,'KeyE');a=await snapshot(page);
    check('E occupies concrete '+name+' driver seat without starting Golf',a.player.vehicleId===id && a.player.seatId==='driver'
      && a.player.mode==='driver' && !a.pedestrian.active && !a.drive.active
      && seatIn(a,id,'driver').occupiedBy===a.player.playerId && distance(a.player.position,seatIn(a,id,'driver').position)<1e-6);
    await page.keyboard.down('w');await step(page,30);await page.keyboard.up('w');let b=await snapshot(page);
    check('Seated '+name+' ignores walking input and stays attached',same(a.player.position,b.player.position) && b.pedestrian.keys.length===0);
    if(name!=='procedural')await shot(page,'seating-'+name+'-seated');
    await key(page,'KeyC');check('Seated car camera changes '+name,distance(a.camera.position,(await snapshot(page)).camera.position)>1);
    await key(page,'Escape');b=await snapshot(page);
    check('Esc safely exits '+name+' and resumes walking once',b.player.mode==='onFoot' && b.player.vehicleId===null && b.pedestrian.active
      && !b.pedestrian.blocked && seatIn(b,id,'driver').occupiedBy===null
      && distance(b.player.position,seatIn(a,id,'driver').entry)<1.5);
  }
  const id='parked-lexus-rx';
  await approach(id,'front-passenger');await key(page,'KeyE');a=await snapshot(page);
  check('Right side selects front passenger',a.player.mode==='passenger' && a.player.seatId==='front-passenger');
  await page.evaluate(()=>window.__blockSeatExit(true));const seatedPosition=a.player.position;
  await click(page,'#seatExit');a=await snapshot(page);
  check('Blocked exit refuses without teleport or releasing occupancy',a.player.vehicleId===id && same(a.player.position,seatedPosition)
    && seatIn(a,id,'front-passenger').occupiedBy===a.player.playerId && a.seatMessage.includes('нет свободного места'));
  await click(page,'#map');a=await snapshot(page);
  check('Preset cannot bypass blocked physical exit',a.player.vehicleId===id && !a.camera.enabled);
  await page.evaluate(()=>window.__blockSeatExit(false));await key(page,'KeyE');
  await approach(id,'driver');await page.evaluate(([id])=>window.__occupySeat(id,'driver',true),[id]);await step(page);
  await key(page,'KeyE');a=await snapshot(page);
  check('Occupied nearest seat rejects E without switching sides',a.player.mode==='onFoot' && a.player.vehicleId===null
    && seatIn(a,id,'driver').occupiedBy==='fixture-player' && a.seatMessage.includes('занято'));
  await page.evaluate(([id])=>window.__occupySeat(id,'driver',false),[id]);
  await approach('parked-golf-player','driver');await key(page,'KeyE');a=await snapshot(page);
  check('Silver Golf driver seat starts existing drive controller',a.drive.active && a.player.vehicleId==='parked-golf-player'
    && !a.pedestrian.active && a.player.mode==='driver');
  await page.keyboard.down('w');await step(page,60);await page.keyboard.up('w');a=await snapshot(page);
  check('Physical seated Golf drives and carries character',a.drive.speed>3 && distance(a.golf.position,a.home)>1
    && distance(a.player.position,seatIn(a,'parked-golf-player','driver').position)<1e-6);
  await shot(page,'seating-golf-driving');
  const moved=a.golf.position;
  await key(page,'KeyE');a=await snapshot(page);
  check('Moving Golf refuses physical exit',a.drive.active && a.player.mode==='driver' && a.seatMessage.includes('Останови'));
  await click(page,'#walk');a=await snapshot(page);
  check('Walking button cannot bypass speed guard',a.drive.active && a.player.mode==='driver');
  await page.keyboard.down('Space');await step(page,120);await page.keyboard.up('Space');a=await snapshot(page);
  check('Handbrake still stops seated Golf',Math.abs(a.drive.speed)<.5);
  const stopped=a.golf.position;
  await click(page,'#driveExit');a=await snapshot(page);
  check('Drive exit preserves stopped Golf pose and resumes on foot',!a.drive.active && a.pedestrian.active && !a.pedestrian.blocked
    && a.player.mode==='onFoot' && distance(stopped,a.golf.position)<1e-7 && distance(a.golf.position,a.home)>1 && a.golfBlocking);
  await shot(page,'seating-golf-exit');
  await approach('parked-golf-player','front-passenger');await key(page,'KeyE');a=await snapshot(page);
  check('Golf passenger seat does not give driving input',!a.drive.active && a.player.mode==='passenger');
  await click(page,'#day');check('Night works while seated',(await snapshot(page)).lighting.sun===.65);
  await click(page,'#day');await click(page,'#meet');a=await snapshot(page);
  check('Camera preset safely releases passenger seat and preserves parked Golf',!a.drive.active && a.player.vehicleId===null
    && a.camera.enabled && distance(stopped,a.golf.position)<1e-7);
  await click(page,'#drive');await key(page,'KeyR');await key(page,'Escape');a=await snapshot(page);
  check('Legacy Golf button and R still reset home',!a.drive.active && distance(a.golf.position,a.home)<1e-7 && !a.golfBlocking);
}

let server,browser;
try {
  await mkdir(out,{recursive:true});
  await build({root,logLevel:'error',build:{outDir:join(out,'dist'),emptyOutDir:false},plugins:[{
    name:'read-only-functional-observation',
    transform(code,id) { if(id.replaceAll('\\','/')===join(root,'src/main.js').replaceAll('\\','/')) return code+'\n'+observation; },
  }]});
  server=await startServer({root:join(out,'dist'),port:0});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--force-color-profile=srgb']});
  report.browser=browser.version();
  const url='http://127.0.0.1:'+server.address().port+'/';
  const scenarios=[['seating',seatingTests],['scene',sceneTests],['traffic',trafficTests],['drive',driveTests],['mobile',mobileTests,true],['pedestrian',pedestrianTests]];
  const selected=process.argv.includes('--seating')?'seating':process.argv.includes('--pedestrian')?'pedestrian':null;
  for(const [name,test,mobile] of selected ? scenarios.filter(s=>s[0]===selected) : scenarios) {
    console.log('\nScenario: '+name);
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:850},deviceScaleFactor:1,isMobile:Boolean(mobile),hasTouch:Boolean(mobile)});
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(name+': '+String(e)));
    page.on('console',m=>{if(m.type()==='error' && !/favicon/.test(m.location()?.url||'')) report.errors.push(name+': '+m.text());});
    try {
      await page.addInitScript(clock); await page.goto(url);
      await page.waitForFunction(()=>typeof window.__readDiorama==='function',null,{polling:100,timeout:120000});
      await page.waitForFunction(()=>document.getElementById('view')?.dataset.lexusModel==='loaded'
        && document.getElementById('view')?.dataset.mercedesModel==='loaded',null,{timeout:120000,polling:100});
      await step(page,2); await test(page,context);
      report.errors.push(...await page.evaluate(()=>window.__functionalErrors));
    } catch(error) {
      report.errors.push(name+': '+String(error.stack||error));
      try {await shot(page,name+'-failure');} catch {}
      throw error;
    } finally {await context.close();}
  }
  check('No browser console or page errors',report.errors.length===0,report.errors.join(' | '));
  report.ok=true;
} catch(error) {
  if(!report.errors.length) report.errors.push(String(error.stack||error));
  console.error(error.stack||error); process.exitCode=1;
} finally {
  await browser?.close(); if(server) await new Promise(done=>server.close(done));
  await mkdir(out,{recursive:true});
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`${report.checks.filter(c=>c.ok).length}/${report.checks.length} checks passed; ok=${report.ok}`);
}
