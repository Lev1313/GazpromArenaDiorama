// Archive successful validation without touching any approved baseline.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const current='browser-tests/_current/',out='browser-tests/reports/2026-10-17-gla-x156/';
const report=JSON.parse(await fs.readFile(current+'report.json','utf8'));
if(!report.ok||report.errors.length||report.wheelSequences?.length!==5)throw new Error('Successful full five-type suite required');
await fs.mkdir(out,{recursive:true});
for(const [from,to] of [['report.json','browser-report.json'],['gla-unit.log','unit-tests.log'],['gla-build.log','build.log'],
  ['gla-source/prepared-audit.json','model-audit.json'],['gla-review/snapshot.json','review-snapshot.json']])await fs.copyFile(current+from,out+to);
await fs.copyFile('performance/_current/gla/report.json',out+'performance.json');
const sequence=report.wheelSequences.find(s=>s.id==='parked-mercedes-gla-x156');
await fs.writeFile(out+'wheel-sequence.json',JSON.stringify(sequence,null,2));
const shots=['front','rear','left','right','night'];
for(const name of shots)await fs.copyFile(current+'gla-review/'+name+'.png',out+name+'.png');
for(const sample of sequence.samples)await fs.copyFile(current+sample.file,out+sample.file);
await fs.copyFile(current+'gla-driving-night.png',out+'gla-driving-night.png');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hashes={};
const sources=execFileSync('git',['ls-files','src','tests','tools'],{encoding:'utf8'}).trim().split(/\r?\n/);
for(const p of [...sources,'src/vehicles/parkedGlaModel.js','tests/gla-model.test.mjs','tools/gla-archive.mjs','tools/gla-review.mjs',
  'tools/gla-perf.mjs','tools/prepare-gla-model.mjs','tools/prepare-gla-textures.ps1','public/models/cars/mercedes_gla_x156_black_wheels.glb',
  'public/models/cars/golf6_red_v2.glb','public/models/cars/lexus_rx_deep_blue_mica.glb','public/models/cars/mercedes_gl_x166_obsidian_black.glb',
  'public/models/cars/golf6_red_v2_wheels.glb','public/models/cars/lexus_rx_deep_blue_mica_wheels.glb','public/models/cars/mercedes_gl_x166_obsidian_black_wheels.glb'])hashes[p]=sha(await fs.readFile(p));
await fs.writeFile(out+'source-hashes.json',JSON.stringify(hashes,null,2));
await fs.writeFile(out+'review.html',`<!doctype html><meta charset="utf-8"><title>GLA X156 — Stage 7D review</title><style>body{font:16px system-ui;background:#141d2a;color:#eee;max-width:1200px;margin:24px auto}img{max-width:100%}figure{margin:24px 0}pre{white-space:pre-wrap}input{width:90%}a{color:#91dcff}</style><h1>Mercedes-Benz GLA X156</h1><p>ItsDiyor · CC BY 4.0. Real scene captures. Vehicle motion uses E + keyboard physics. <a href="RESULTS.md">Report</a></p>
${shots.map(n=>`<figure><img src="${n}.png"><figcaption>${n}</figcaption></figure>`).join('')}
<h2>Driving: wheel frames, 5/60 seconds apart</h2><p>Move the slider to compare actual rendered frames and recorded wheel angles.</p><input id="frame" type="range" min="0" max="2" step="1" value="0"><div style="display:flex"><img id="leftFrame" style="width:50%"><img id="rightFrame" style="width:50%"></div><pre id="angles"></pre><h2>Active headlights</h2><img src="gla-driving-night.png">
<script>const samples=${JSON.stringify(sequence.samples)};function show(){const n=+document.querySelector('#frame').value;document.querySelector('#leftFrame').src=samples[n].file;document.querySelector('#rightFrame').src=samples[n+3].file;document.querySelector('#angles').textContent=samples[n].wheels.map(w=>w.id+': angle '+w.angle.toFixed(6)+' rad, radius '+w.radius.toFixed(6)+' m, steer '+w.steer.toFixed(6)).join(String.fromCharCode(10))}document.querySelector('#frame').oninput=show;show();</script>`);
console.log(out,report.checks.length+' browser checks');
