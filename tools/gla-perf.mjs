// Same full scene, master cc3aaa7 versus nineteenth car. Software-render timings only.
import { build } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'performance/_current/gla');
await fs.mkdir(out,{recursive:true});
const suite=await fs.readFile(resolve(root,'tools/vite-functional.mjs'),'utf8');
const observation=suite.match(/const observation = `([\s\S]*?)`;\r?\n\r?\nfunction clock/)[1];
const clock=suite.slice(suite.indexOf('function clock()'),suite.indexOf('const snapshot ='));
const changed=['src/main.js','src/world/parkingMeet.js','src/vehicles/vehicleSeats.js','src/vehicles/vehicleTuning.js'];
const sources=new Map(changed.map(p=>[p,execFileSync('git',['show','cc3aaa7:'+p],{cwd:root,encoding:'utf8'})]));
for(const version of ['baseline','candidate']) await build({root,logLevel:'error',build:{outDir:out+'/'+version,emptyOutDir:false},plugins:[{
  name:'comparison',enforce:'pre',transform(code,id){const relative=id.replaceAll('\\','/').replace(root.replaceAll('\\','/')+'/','');
    const source=version==='baseline'&&sources.has(relative)?sources.get(relative):code;
    if(relative==='src/main.js')return source+'\n'+observation+`
window.__perfView=()=>{const target=new THREE.Vector3(6.5,.65,37);camera.position.set(13,3,42);controls.target.copy(target);camera.lookAt(target);renderer.render(scene,camera);};`;
    if(source!==code)return source;
  },
}]});
const servers={baseline:await startServer({port:0,root:out+'/baseline'}),candidate:await startServer({port:0,root:out+'/candidate'})};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={baseline:'cc3aaa7',browser:browser.version(),method:'Local cold browser contexts, same paused day full scene/camera at new bay. Three alternating repetitions, 8 warmup + 20 frames. Node RPC wall time around render+gl.finish; not hardware FPS or internet loading. Resource timings use native browser ResourceTiming, not manual simulation clock.',runs:[],errors:[]};
try {
  for(let run=0;run<3;run++)for(const version of run%2?['candidate','baseline']:['baseline','candidate']) {
    const context=await browser.newContext({viewport:{width:1200,height:800}}),page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(String(e)));
    await page.addInitScript({content:clock+'\nclock();'});
    const start=performance.now();await page.goto('http://127.0.0.1:'+servers[version].address().port);
    await page.waitForFunction(candidate=>window.__readDiorama&&document.querySelector('#view').dataset.lexusModel==='loaded'
      &&document.querySelector('#view').dataset.mercedesModel==='loaded'&&(!candidate||document.querySelector('#view').dataset.glaModel==='loaded'),version==='candidate',{polling:100,timeout:120000});
    const readyMs=performance.now()-start;
    await page.evaluate(()=>{window.__step(2);document.querySelector('#day').click();document.querySelector('#pause').click();window.__step(2);window.__perfView();});
    // Camera stays fixed while paused; renderer normally uses OrbitControls target.
    await page.evaluate(()=>window.__step(8));
    const samples=[];
    for(let i=0;i<20;i++){const now=performance.now();await page.evaluate(()=>window.__step(1));samples.push(performance.now()-now);}
    const state=await page.evaluate(()=>window.__readDiorama());
    const models=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('.glb')).map(e=>({file:e.name.split('/').pop(),durationMs:e.duration,transferBytes:e.transferSize})));
    report.runs.push({run,version,readyMs,samples,resources:state.resources,models});
    await context.close();
  }
} finally {await browser.close();for(const server of Object.values(servers))await new Promise(done=>server.close(done));}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
report.summary={};for(const version of ['baseline','candidate']){const runs=report.runs.filter(r=>r.version===version);report.summary[version]={readyMedianMs:median(runs.map(r=>r.readyMs)),frameWallMedianMs:median(runs.flatMap(r=>r.samples)),calls:runs[0].resources.calls,triangles:runs[0].resources.triangles,geometries:runs[0].resources.sceneGeometries,materials:runs[0].resources.sceneMaterials,textures:runs[0].resources.sceneTextures};}
await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));
