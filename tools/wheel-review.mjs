// Archive measured frame sequences after the complete functional suite passes.
import fs from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..'),current=resolve(root,'browser-tests/_current');
const report=JSON.parse(fs.readFileSync(resolve(current,'report.json'),'utf8'));
if(!report.ok||report.errors.length||report.wheelSequences?.length!==4)throw new Error('Run the final full browser suite first');
const out=resolve(root,'browser-tests/reports/2026-10-16-wheel-animation');fs.mkdirSync(out,{recursive:true});
for(const seq of report.wheelSequences)for(const frame of seq.samples)fs.copyFileSync(resolve(current,frame.file),resolve(out,frame.file));
fs.writeFileSync(resolve(out,'wheel-sequences.json'),JSON.stringify(report.wheelSequences,null,2));
fs.copyFileSync(resolve(current,'report.json'),resolve(out,'report.json'));
fs.copyFileSync(resolve(current,'wheels/model-audit.json'),resolve(out,'model-audit.json'));
fs.copyFileSync(resolve(root,'performance/_current/wheels/report.json'),resolve(out,'cpu-report.json'));
const panels=report.wheelSequences.map((seq,n)=>`<section><h2>${seq.id}</h2><div class="sides">${[-1,1].map((side,k)=>{
  const frames=seq.samples.slice(k*3,k*3+3);
  return `<article><h3>${side<0?'Слева':'Справа'} · три реальных кадра</h3><img id="img${n}-${k}" src="${frames[0].file}"><label>Кадр <input type="range" min="0" max="2" value="0" data-seq="${n}" data-side="${k}"></label><pre id="angles${n}-${k}"></pre></article>`;
}).join('')}</div></section>`).join('');
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Stage 7C.1 — колёса</title><style>body{margin:24px;background:#14202c;color:#e4edf4;font:16px system-ui}a{color:#8dd7ff}.sides{display:grid;grid-template-columns:1fr 1fr;gap:18px}img{width:100%}pre{font-size:13px}section{margin:32px 0}input{width:60%}@media(max-width:900px){.sides{display:block}}</style><h1>Stage 7C.1 — вращение колёс</h1><p>Снимки настоящей сцены: физическая посадка E и движение клавишами, без программной перестановки автомобиля. В каждой стороне три последовательных кадра с интервалом 5/60 с. Ползунок переключает сохранённые PNG; углы ниже взяты из тех же кадров.</p><p><a href="RESULTS.md">Отчёт, аудит моделей и ограничения</a></p>${panels}<script>const seq=${JSON.stringify(report.wheelSequences)};function show(n,k,i){const f=seq[n].samples[k*3+i];document.getElementById('img'+n+'-'+k).src=f.file;document.getElementById('angles'+n+'-'+k).textContent=f.wheels.map(w=>w.id+': roll '+w.angle.toFixed(6)+' rad, steer '+w.steer.toFixed(6)+' rad').join(String.fromCharCode(10))}document.querySelectorAll('input').forEach(e=>{e.oninput=()=>show(+e.dataset.seq,+e.dataset.side,+e.value);e.oninput()});</script></html>`;
fs.writeFileSync(resolve(out,'review.html'),html);console.log(out);
