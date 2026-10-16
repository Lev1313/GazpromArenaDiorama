// Reproducible simulation-only comparison with the confirmed Stage 7B master.
// No renderer, GLB parse or GPU timing: this is not a gaming-FPS measurement.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createMaterialSystem } from '../src/materials/materials.js';
import { createCarFactory } from '../src/vehicles/car.js';
import { createParkingMeet } from '../src/world/parkingMeet.js';
import { createVehicleRegistry } from '../src/vehicles/vehicleSeats.js';
import { createVehicleDrive } from '../src/vehicles/vehicleDrive.js';
import { createDriftSystem } from '../src/vehicles/drift.js';
import { createTrafficSystem } from '../src/vehicles/traffic.js';

const root=resolve(import.meta.dirname,'..'), out=resolve(root,'performance/_current/multi-car');
await mkdir(out,{recursive:true});
async function baseline(name) {
  let code=execFileSync('git',['show',`e7dcf3e:src/vehicles/${name}.js`],{cwd:root,encoding:'utf8'});
  code=code.replace(/from '([^']+)'/g,(all,path)=>{
    if(!path.startsWith('.'))return all;
    const file=path==='./golfDrive.js' ? resolve(out,'golfDrive.mjs') : resolve(root,'src/vehicles',path);
    return `from '${pathToFileURL(file).href}'`;
  });
  const path=resolve(out,name+'.mjs');await writeFile(path,code);return import(pathToFileURL(path));
}
const oldDrive=await baseline('golfDrive'), oldTraffic=await baseline('traffic'), oldDrift=await baseline('drift');
function fixture(modern) {
  const scene=new THREE.Scene(), {mat}=createMaterialSystem(), factory=createCarFactory(scene,mat);
  const {parked,golf,people,markings}=createParkingMeet(scene,mat,{slab:mat(0xcccccc),concrete:mat(0xaaaaaa)},factory);
  createVehicleRegistry(parked);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-40,17,-100),new THREE.Vector3(-40,17,100)]);
  const traffic=(modern?createTrafficSystem:oldTraffic.createTrafficSystem)(scene,factory,
    {highwayCurve:curve,highwayPoint:(t,lane)=>curve.getPoint(t).add(new THREE.Vector3(lane,0,0))},markings);
  const drift=(modern?createDriftSystem:oldDrift.createDriftSystem)(scene,factory,{makeSmokeTexture:()=>new THREE.Texture()});
  const drive=(modern?createVehicleDrive:oldDrive.createGolfDrive)({golf,parked,people,visitors:traffic.visitors,
    drifters:drift.drifters,drift,camera:new THREE.PerspectiveCamera(),
    controls:{target:new THREE.Vector3(),update(){}},isDriveable:()=>true});
  return ()=>{
    drive.updateDriving(1/60);
    const options=modern?{people,obstacles:parked}:{people};
    traffic.update(1/60,options);drift.update(1/60,options);
  };
}
const samples={baseline:[],candidate:[]};
for(let batch=0;batch<5;batch++)for(const modern of batch%2?[true,false]:[false,true]) {
  const update=fixture(modern);for(let i=0;i<1000;i++)update();
  const start=performance.now();for(let i=0;i<10000;i++)update();
  samples[modern?'candidate':'baseline'].push((performance.now()-start)/10000);
}
const median=a=>[...a].sort((x,y)=>x-y)[2];
const report={baseline:'e7dcf3e',method:'5 alternating batches x 10000 frames after 1000 warmup; Node simulation only; original parking layout; inactive local driver; full traffic/drift/effects',
  node:process.version,samples,medianMs:{baseline:median(samples.baseline),candidate:median(samples.candidate)}};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
