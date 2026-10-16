// Active driving CPU comparison only; excludes WebGL and is not hardware FPS.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as T from 'three';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createVehicleDrive } from '../src/vehicles/vehicleDrive.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'performance/_current/wheels');
await mkdir(out,{recursive:true});
let source=execFileSync('git',['show','da6bb46:src/vehicles/vehicleDrive.js'],{cwd:root,encoding:'utf8'});
source=source.replace(/from '([^']+)'/g,(text,path)=>path.startsWith('.')?`from '${pathToFileURL(resolve(root,'src/vehicles',path)).href}'`:text);
await writeFile(resolve(out,'baseline.mjs'),source);
const baseline=(await import(pathToFileURL(resolve(out,'baseline.mjs')))).createVehicleDrive;
function fixture(factory) {
  const scene=new T.Scene(),{mat}=createMaterialSystem(),car=createCarFactory(scene,mat).car(0xff0000);
  car.position.set(1000,0,1000);
  const drive=factory({golf:car,parked:[car],people:[],visitors:[],drifters:[],camera:new T.PerspectiveCamera(),
    controls:{target:new T.Vector3(),update(){}},isDriveable:()=>true,drift:{smokeEnabled:false,driftWaiting:false}});
  drive.setDriving(true);drive.setKey('KeyW',true);return ()=>drive.updateDriving(1/60);
}
const samples={baseline:[],candidate:[]};
for(let round=0;round<7;round++)for(const modern of round%2?[true,false]:[false,true]) {
  const update=fixture(modern?createVehicleDrive:baseline);for(let i=0;i<2000;i++)update();
  const start=performance.now();for(let i=0;i<20000;i++)update();
  samples[modern?'candidate':'baseline'].push((performance.now()-start)/20000);
}
const median=a=>[...a].sort((a,b)=>a-b)[3];
const report={baseline:'da6bb46',node:process.version,method:'7 alternating batches, 2000 warmup + 20000 active straight-driving steps at 60Hz; four-wheel rig; no renderer',
  samples,medianMs:{baseline:median(samples.baseline),candidate:median(samples.candidate)}};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
