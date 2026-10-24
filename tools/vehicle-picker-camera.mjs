// Targeted camera regression only. Test hooks exist solely in the private Vite server.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';

const observation=`
window.__pickerCamera=()=>{
  const pose=c=>({position:c.position.toArray(),quaternion:c.quaternion.toArray()});
  return {camera:pose(camera),target:controls.target.toArray(),enabled:controls.enabled,
    rendered:pose(vehiclePicker.renderCamera),peeking:vehiclePicker.renderCamera!==camera,
    walking:pedestrian.state.active,seated:seating.isSeated(),driving:drive.state.active};
};
window.__pickerDoor=seat=>{
  const p=vehicleRegistry.worldPosition('parked-mercedes-gla-x156',seat);
  if(!pedestrian.resumeAt(p))throw Error('Unsafe test door');
};`;
let server,browser;
try{
  server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},plugins:[{
    name:'picker-camera-observation',transform(code,id){
      if(id.replaceAll('\\','/').endsWith('/src/main.js'))return code+'\n'+observation;
    },
  }]});
  await server.listen();
  browser=await chromium.launch({channel:'chrome',headless:true,args:[
    '--use-angle=swiftshader','--enable-unsafe-swiftshader',
  ]});
  const page=await browser.newPage({viewport:{width:1300,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    let now=0,id=0;const callbacks=new Map();
    performance.now=()=>now;
    window.requestAnimationFrame=fn=>{callbacks.set(++id,fn);return id;};
    window.cancelAnimationFrame=id=>callbacks.delete(id);
    window.__pickerStep=(ms=16)=>{now+=ms;const pending=[...callbacks.values()];callbacks.clear();for(const fn of pending)fn(now);};
  });
  await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.__pickerCamera==='function',null,{polling:100,timeout:120000});
  await page.waitForFunction(()=>document.querySelector('#view')?.dataset.glaModel==='loaded',null,{polling:100,timeout:120000});
  const step=(ms=16)=>page.evaluate(ms=>window.__pickerStep(ms),ms);
  const click=selector=>page.evaluate(s=>{
    const el=document.querySelector(s);assertElement(el,s);el.focus();el.click();
    function assertElement(el,s){if(!el||el.disabled||el.closest('[hidden]'))throw Error('Unavailable UI: '+s);}
  },selector);
  const read=()=>page.evaluate(()=>window.__pickerCamera());
  const same=(actual,expected,label)=>{
    for(const key of ['position','quaternion'])actual.camera[key].forEach((v,i)=>assert(Math.abs(v-expected.camera[key][i])<1e-7,label+' '+key));
    actual.target.forEach((v,i)=>assert(Math.abs(v-expected.target[i])<1e-7,label+' target'));
    assert.equal(actual.enabled,expected.enabled,label+' controls');
    assert.equal(actual.peeking,false,label+' stops preview');
  };
  const select=()=>click('[data-vehicle-id="parked-mercedes-gla-x156"]');
  await mkdir('browser-tests/_current/picker-camera',{recursive:true});
  await step();await click('#pause');
  // Start from a user-rotated view with residual OrbitControls damping.
  await page.mouse.move(1000,650);await page.mouse.down();
  await page.mouse.move(1060,620,{steps:3});await page.mouse.up();await step();
  for(const mode of ['overview','walking']){
    if(mode==='walking')await click('#walk');
    await step(250);
    for(const end of ['timer','return','close','escape','change','clear']){
      if(await page.locator('#vehiclePickerPanel').isHidden())await click('#vehiclePickerToggle');
      await select();await step(250);
      assert.equal(await page.locator('[data-vehicle-id="parked-mercedes-gla-x156"]').evaluate(el=>el===document.activeElement),true);
      const before=await read();
      await click('#vehiclePickerLook');await step(16);
      const preview=await read();assert.equal(preview.peeking,true);
      assert(preview.rendered.position.some((v,i)=>Math.abs(v-before.camera.position[i])>1),'Preview changes rendered camera');
      if(mode==='overview'&&end==='timer')await page.screenshot({path:'browser-tests/_current/picker-camera/preview.png'});
      if(end==='timer')await step(3001);
      else{
        if(end==='return')await click('#vehiclePickerLook');
        if(end==='close')await click('#vehiclePickerClose');
        if(end==='escape')await page.keyboard.press('Escape');
        if(end==='change')await click('[data-vehicle-id="parked-golf-red"]');
        if(end==='clear')await click('#vehiclePickerClear');
      }
      same(await read(),before,mode+'/'+end);
      await step(16);same(await read(),before,mode+'/'+end+' next frame');
      assert.equal((await read()).walking,mode==='walking');
      if(mode==='overview'&&end==='timer')await page.screenshot({path:'browser-tests/_current/picker-camera/restored.png'});
    }
    console.log('PASS camera returns: '+mode+' (timer, return, close, Escape, change, clear)');
  }
  // Switching modes while peeking must not save a catalog camera as overview.
  await click('#walkExit');await step();const overview=await read();
  if(await page.locator('#vehiclePickerPanel').isHidden())await click('#vehiclePickerToggle');
  await select();await click('#vehiclePickerLook');await step();
  await click('#walk');await step();assert.equal((await read()).peeking,false);
  await click('#walkExit');await step();same(await read(),overview,'walk round trip');
  await click('#walk');await step();
  await click('#pause'); // Physical seating deliberately refuses while the scene is paused.
  for(const seat of ['front-passenger','driver']){
    await page.evaluate(seat=>window.__pickerDoor(seat),seat);await step(250);
    await select();await click('#vehiclePickerLook');await step();
    await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('KeyE');await step();
    const seated=await read();assert.equal(seated.seated,true);assert.equal(seated.peeking,false);
    assert.equal(seated.driving,seat==='driver');
    assert.equal(await page.locator('#vehiclePickerLook').isDisabled(),true);
    await click('#vehiclePickerClose');await step();
    const after=await read();assert.equal(after.seated,true);assert.equal(after.enabled,false);
    assert(after.camera.position.some((v,i)=>Math.abs(v-overview.camera.position[i])>1),'Seat camera owns the view');
    await click('#seatExit');await step();assert.equal((await read()).walking,true);
    await click('#vehiclePickerToggle');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS picker camera: 12 return paths, stable next frame, walk transitions, passenger/driver transitions; no page errors');
}finally{await browser?.close();await server?.close();}
