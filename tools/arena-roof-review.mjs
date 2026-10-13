// UTF-8 review gallery only; never modifies or approves reference images.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const dir = resolve(import.meta.dirname, '../vite-baseline/_current');
const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
const views = ['09_arena_day', '03_preset_arena', '05_preset_top', '01_overview_night'];
const labels = ['Арена днём', 'Арена ночью', 'Вид сверху', 'Общий вид'];
// Keep the comparison valid after the approved references are updated.
await mkdir(join(dir, 'before-roof'), { recursive: true });
for (const name of views) {
  await writeFile(join(dir, 'before-roof', name + '.png'), execFileSync('git',
    ['show', `7bf4d21:vite-baseline/screenshots/${name}.png`],
    { cwd: resolve(import.meta.dirname, '..'), maxBuffer: 5 * 1024 * 1024 }));
}
const pairs = views.map((name, i) => `<article><h2>${labels[i]}</h2><div class="pair">
<figure><figcaption>До — утверждённый этап 5.1</figcaption><a href="before-roof/${name}.png"><img src="before-roof/${name}.png" alt="До: ${labels[i]}"></a></figure>
<figure><figcaption>После — этап 6.1</figcaption><a href="${name}.png"><img src="${name}.png" alt="После: ${labels[i]}"></a></figure>
</div></article>`).join('\n');
await writeFile(join(dir, 'architecture-review.html'), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Арена · крыша · сравнение до и после</title><style>
body{margin:24px;background:#101725;color:#e5efff;font:16px/1.5 system-ui}main{max-width:1800px;margin:auto}
a{color:#79ceff}article{margin:24px 0;background:#20364b;padding:16px;border-radius:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;display:block}h2{font-size:20px}
@media(max-width:850px){.pair{grid-template-columns:1fr}}
</style></head><body><main><h1>Этап 6.1 — закрытая крыша арены</h1>
<p>Вариант крыши утверждён заказчиком 13 октября 2026 года. Две створки, голубоватое покрытие и сетка переплётов.
Габариты крыши сохранены. Это статичная непрозрачная модель; механизма открывания пока нет.</p>
<p>Основа: <a href="https://gazprom-arena.com/technologies">официальные материалы арены</a>.
Шаг сетки и сечения подобраны для масштаба диорамы, а не по обмерным чертежам.</p>
<p>Снято ${report.shots.length} кадров; проверки съёмки ${report.checks.filter(x => x.ok).length}/${report.checks.length}.
<a href="report.json">Отчёт съёмки</a> · <a href="/">Живая сцена через Vite</a>.</p>
${pairs}<h2>Все новые кадры</h2><p>${report.shots.map(name => `<a href="${encodeURIComponent(name)}.png">${name}</a>`).join(' · ')}</p>
</main></body></html>`, 'utf8');
console.log('Created vite-baseline/_current/architecture-review.html');
