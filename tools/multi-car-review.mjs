// Four review captures from the private functional build, using E and keyboard physics.
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from './serve.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'browser-tests/_current/multi-car-review');
await mkdir(out,{recursive:true});
const suite=await readFile(resolve(root,'tools/vite-functional.mjs'),'utf8');
const clock=suite.slice(suite.indexOf('function clock()'),suite.indexOf('const snapshot ='));
const server=await startServer({port:0,root:resolve(root,'browser-tests/_current/dist')});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const result={errors:[],captures:[]};
try {
  for(const [id,index,name] of [['parked-golf-red',2,'red-golf'],['parked-lexus-rx',17,'lexus-rx'],
    ['parked-mercedes-gl',16,'mercedes-gl'],['parked-07',7,'procedural']]) {
    const page=await browser.newPage({viewport:{width:1400,height:850}});
    page.on('pageerror',e=>result.errors.push(String(e)));
    await page.addInitScript({content:clock+'\nclock();'});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>window.__readDiorama && document.querySelector('#view').dataset.lexusModel==='loaded'
      && document.querySelector('#view').dataset.mercedesModel==='loaded',null,{polling:100,timeout:120000});
    const step=frames=>page.evaluate(n=>window.__step(n),frames);
    await step(2);await page.click('#day');await page.click('#walk');await step(1);
    await page.evaluate(id=>window.__approachSeat(id,'driver'),id);await step(1);
    await page.keyboard.press('KeyE');await step(1);
    const before=await page.evaluate(()=>window.__readDiorama());
    assert(before.drive.active && before.player.vehicleId===id);
    await page.keyboard.down('KeyW');await step(45);await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyA');await step(8);await page.keyboard.up('KeyA');
    const after=await page.evaluate(()=>window.__readDiorama());
    assert(Math.hypot(...after.parked[index].position.map((n,i)=>n-before.parked[index].position[i]))>.5);
    await page.screenshot({path:resolve(out,name+'.png'),timeout:120000});
    result.captures.push({id,file:name+'.png',before:before.parked[index],after:after.parked[index],speed:after.status.speedKmh});
    await page.close();
  }
  assert.equal(result.errors.length,0);
  await writeFile(resolve(out,'report.json'),JSON.stringify(result,null,2));
  await writeFile(resolve(out,'review.html'),'<!doctype html><meta charset="utf-8"><title>Stage 7C</title><style>body{background:#13202b;color:white;font:18px sans-serif}img{width:100%;max-width:1400px}section{margin-bottom:32px}</style><h1>Stage 7C — Multi-car driving</h1>'+result.captures.map(c=>`<section><h2>${c.id} · ${c.speed} km/h</h2><img src="${c.file}"></section>`).join(''));
  console.log(JSON.stringify(result));
} finally {await browser.close();await new Promise(done=>server.close(done));}
