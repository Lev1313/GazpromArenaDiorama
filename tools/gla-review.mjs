import fs from 'node:fs/promises';import {build} from 'vite';import {chromium} from 'playwright-core';import {startServer} from './serve.mjs';import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'browser-tests/_current/gla-review');await fs.mkdir(out,{recursive:true});
const suite=await fs.readFile(resolve(root,'tools/vite-functional.mjs'),'utf8');
const observation=suite.match(/const observation = `([\s\S]*?)`;\r?\n\r?\nfunction clock/)[1];
const clock=suite.slice(suite.indexOf('function clock()'),suite.indexOf('const snapshot ='));
const extra=`
window.__probeGla=()=>{const v=vehicleRegistry.vehicles[18];return {pose:v.car.position.toArray(),footprint:v.car.userData.footprint,seats:v.seats.map(s=>{const p=vehicleRegistry.worldPosition(v,s);return {id:s.seatId,point:p.toArray(),hit:pedestrian.collision(p.x,p.z)}})}};
window.__reviewGla=(direction)=>{const c=parked[18];const p=c.localToWorld(new THREE.Vector3(...direction));const target=c.localToWorld(new THREE.Vector3(0,.65,0));camera.position.copy(p);camera.lookAt(target);controls.target.copy(target);renderer.render(scene,camera);};`;
await build({root,logLevel:'error',build:{outDir:out+'/dist',emptyOutDir:false},plugins:[{name:'review',transform(code,id){if(id.replaceAll('\\','/')===root.replaceAll('\\','/')+'/src/main.js')return code+'\n'+observation+extra;}}]});
const server=await startServer({root:out+'/dist',port:0}),browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',console.error);await page.addInitScript({content:clock+'\nclock();'});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__probeGla&&document.querySelector('#view').dataset.glaModel==='loaded'&&document.querySelector('#view').dataset.lexusModel==='loaded'&&document.querySelector('#view').dataset.mercedesModel==='loaded',null,{polling:100,timeout:120000});
await page.evaluate(()=>window.__step(2));console.log(JSON.stringify(await page.evaluate(()=>window.__probeGla()),null,2));
await page.addStyleTag({content:'#golf-ui,#seating-ui,#full-hud,#hint,#hudToggle,#pedestrian-ui,#pedestrianPanel{visibility:hidden!important}'});
await page.evaluate(()=>{document.querySelector('#day').click();document.querySelector('#pause').click();document.querySelector('#walk').click();window.__step(2);});
for(const [name,position] of [['front',[6,2,3]],['rear',[-6,2,-3]],['left',[0,1.2,-6]],['right',[0,3,6]]]){await page.evaluate(p=>window.__reviewGla(p),position);await page.screenshot({path:out+'/'+name+'.png',timeout:120000});}
// Unpause for physical E entry, then freeze the seated view for capture.
await page.evaluate(()=>{document.querySelector('#pause').click();window.__approachSeat('parked-mercedes-gla-x156','driver');});
await page.keyboard.press('KeyE');
await page.evaluate(()=>{window.__step(1);if(window.__readDiorama().player.mode!=='driver')throw new Error('Physical E entry required');document.querySelector('#pause').click();document.querySelector('#day').click();window.__step(1);window.__reviewGla([6,2.5,3]);});await page.screenshot({path:out+'/night.png',timeout:120000});
await fs.writeFile(out+'/snapshot.json',JSON.stringify(await page.evaluate(()=>window.__readDiorama()),null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
