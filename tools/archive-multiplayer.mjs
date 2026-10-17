// Preserve Stage 8A evidence separately from all approved visual baselines.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const current='browser-tests/_current/multiplayer/',out='browser-tests/reports/2026-10-17-multiplayer-walking/';
const network=JSON.parse(await fs.readFile(current+'report.json','utf8'));
const solo=JSON.parse(await fs.readFile('browser-tests/_current/report.json','utf8'));
const decodeLog=buffer=>buffer[0]===0xff&&buffer[1]===0xfe?buffer.subarray(2).toString('utf16le'):buffer.toString('utf8');
const unit=decodeLog(await fs.readFile(current+'unit-tests.log'));
if(!network.ok||network.errors.length||!solo.ok||solo.errors.length||!unit.includes('fail 0'))throw Error('Successful final checks required');
await fs.mkdir(out,{recursive:true});
for(const name of ['report.json','unit-tests.log','build.log','final-browser.log','two-players-client-a.png','two-players-client-b.png']){
  if(name.endsWith('.log'))await fs.writeFile(out+name,decodeLog(await fs.readFile(current+name)));
  else await fs.copyFile(current+name,out+name);
}
await fs.copyFile('browser-tests/_current/report.json',out+'singleplayer-report.json');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','server','tests','tools','package.json','package-lock.json'],{encoding:'utf8'}).trim().split(/\r?\n/);
for(const name of await fs.readdir('public/models/cars'))if(name.endsWith('.glb'))files.push('public/models/cars/'+name);
const hashes={};for(const file of new Set(files))hashes[file]=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.writeFile(out+'source-hashes.json',JSON.stringify(hashes,null,2));
await fs.writeFile(out+'review.html',`<!doctype html><meta charset="utf-8"><title>Stage 8A — два игрока</title>
<style>body{font:16px system-ui;background:#142134;color:#eff6ff;max-width:1400px;margin:24px auto}img{width:100%}a{color:#9bdcff}</style>
<h1>Stage 8A — два независимых клиента</h1><p><a href="RESULTS.md">Отчёт</a> · <a href="../../../server/README.md">Запуск</a></p>
<h2>Клиент А</h2><img src="two-players-client-a.png"><h2>Клиент Б</h2><img src="two-players-client-b.png">
<p>Одна сцена на клиент. Только перемещения персонажей; автомобили не синхронизируются.</p>`);
console.log(out,solo.checks.length+' single-player + '+network.checks.length+' network browser checks');
