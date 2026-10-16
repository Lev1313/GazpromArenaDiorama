// Same-scene software-rendering comparison. Never edits application sources.
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'performance/_current/wheel-render');
await mkdir(out,{recursive:true});
const suite=await readFile(resolve(root,'tools/vite-functional.mjs'),'utf8');
const observation=suite.match(/const observation = `([\s\S]*?)`;\r?\n\r?\nfunction clock/)[1];
const clock=suite.slice(suite.indexOf('function clock()'),suite.indexOf('const snapshot ='));
const changed=['car','vehicleDrive','parkedGolfModel','parkedLexusModel','parkedMercedesModel'].map(n=>'src/vehicles/'+n+'.js');
const sources=new Map(changed.map(p=>[p,execFileSync('git',['show','da6bb46:'+p],{cwd:root,encoding:'utf8'})]));
await build({root,logLevel:'error',build:{outDir:resolve(out,'baseline'),emptyOutDir:false},plugins:[{
  name:'baseline-source-and-observation',enforce:'pre',transform(code,id){
    const relative=id.replaceAll('\\','/').replace(root.replaceAll('\\','/')+'/','');
    if(sources.has(relative))return sources.get(relative);
    if(relative==='src/main.js')return code+'\n'+observation;
  },
}]});
const servers={baseline:await startServer({port:0,root:resolve(out,'baseline')}),
  candidate:await startServer({port:0,root:resolve(root,'browser-tests/_current/dist')})};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={baseline:'da6bb46',browser:browser.version(),method:'Identical paused full scene/day side cameras; 8 warmup + 15 rendered frames per view, 3 alternating repetitions; Node RPC wall time around manual RAF + gl.finish; Edge SwiftShader, not gaming GPU FPS',runs:[],errors:[]};
try {
  for(let run=0;run<3;run++)for(const version of run%2?['candidate','baseline']:['baseline','candidate']) {
    const page=await browser.newPage({viewport:{width:1400,height:850}});
    page.on('pageerror',e=>report.errors.push(String(e)));
    await page.addInitScript({content:clock+'\nclock();'});
    await page.goto('http://127.0.0.1:'+servers[version].address().port);
    await page.waitForFunction(()=>window.__readDiorama&&document.querySelector('#view').dataset.lexusModel==='loaded'
      &&document.querySelector('#view').dataset.mercedesModel==='loaded',null,{polling:100,timeout:120000});
    await page.evaluate(()=>{window.__step(2);document.querySelector('#day').click();document.querySelector('#drive').click();document.querySelector('#pause').click();});
    for(const [index,name] of [[2,'golf'],[17,'lexus'],[16,'mercedes']]) {
      await page.evaluate(index=>{window.__wheelView(index,-1);window.__step(8);},index);
      const samples=[];
      for(let frame=0;frame<15;frame++){const start=performance.now();await page.evaluate(()=>window.__step(1));samples.push(performance.now()-start);}
      const state=await page.evaluate(()=>window.__readDiorama());
      report.runs.push({run,version,name,samples,resources:state.resources});
    }
    await page.close();
  }
} finally {await browser.close();for(const server of Object.values(servers))await new Promise(done=>server.close(done));}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
report.summary={};for(const name of ['golf','lexus','mercedes']) {
  report.summary[name]={};for(const version of ['baseline','candidate']) {
    const runs=report.runs.filter(r=>r.name===name&&r.version===version);
    report.summary[name][version]={medianWallMs:median(runs.flatMap(r=>r.samples)),calls:runs[0].resources.calls,triangles:runs[0].resources.triangles};
  }
}
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));
