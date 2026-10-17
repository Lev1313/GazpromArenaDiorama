import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const current='browser-tests/_current/multiplayer/',out='browser-tests/reports/2026-10-17-multiplayer-vehicles/';
const network=JSON.parse(await fs.readFile(current+'report.json','utf8'));
const solo=JSON.parse(await fs.readFile('browser-tests/_current/report.json','utf8'));
const decode=b=>b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8');
const unit=decode(await fs.readFile('stage8b-unit.log'));
if(!network.ok||network.errors.length||!solo.ok||solo.errors.length||!unit.includes('fail 0')||network.allVehicleDrives?.length!==19)throw Error('Successful final checks for all 19 cars required');
await fs.mkdir(out,{recursive:true});
for(const name of ['report.json',...network.screenshots])await fs.copyFile(current+name,out+name);
await fs.copyFile('browser-tests/_current/report.json',out+'singleplayer-report.json');
for(const [input,output] of [['stage8b-unit.log','unit-tests.log'],['stage8b-final-browser.log','browser-tests.log'],['stage8b-build.log','build.log']]){
  const log=decode(await fs.readFile(input)).replace(/[\t ]+(?=\r?$)/gm,'');await fs.writeFile(out+output,log);
}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','server','tests','tools','package.json','package-lock.json'],{encoding:'utf8'}).trim().split(/\r?\n/);
for(const name of await fs.readdir('public/models/cars'))if(name.endsWith('.glb'))files.push('public/models/cars/'+name);
const hashes={};for(const file of new Set(files))hashes[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile(out+'source-hashes.json',JSON.stringify(hashes,null,2));
await fs.writeFile(out+'review.html',`<!doctype html><meta charset="utf-8"><title>Stage 8B — совместная поездка</title>
<style>body{font:16px system-ui;background:#142134;color:#eff6ff;max-width:1400px;margin:24px auto}img{width:100%}a{color:#9bdcff}</style>
<h1>Stage 8B — два клиента, одна машина</h1><p><a href="RESULTS.md">Отчёт</a> · <a href="../../../server/README.md">Запуск</a></p>
${network.screenshots.map(name=>`<h2>${name}</h2><img src="${name}">`).join('\n')}
<p>Физическая посадка E подтверждена сервером. Водитель управляет существующей физикой; пассажир связан с сиденьем интерполированной машины.</p>`);
console.log(out,solo.checks.length+' single-player + '+network.checks.length+' network browser checks');
