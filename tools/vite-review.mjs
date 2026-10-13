// Generate the review gallery from a UTF-8 source file, never a shell pipe.
// Does not capture images or approve references.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const dir = resolve(import.meta.dirname, '../vite-baseline/_current');
const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
const labels = [
  'Общий вид — ночь', 'Автосходка', 'Арена — ночь', 'ЗСД', 'Вид сверху',
  'Дрифт', 'Сброс камеры', 'Общий вид — день', 'Арена — день',
  'Дым выключен', 'Golf — сзади', 'Golf — сверху', 'Фотоисточники',
  'Мобильный общий вид', 'Мобильный Golf',
];
const escape = value => String(value).replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cards = report.shots.map((name, i) => {
  const title = escape(labels[i] ?? name);
  const file = escape(encodeURIComponent(name) + '.png');
  return `<article><h2>${String(i + 1).padStart(2, '0')}. ${title}</h2>
    <a href="${file}" target="_blank"><img src="${file}" alt="${title}" loading="lazy"></a>
    <p><a href="${file}" target="_blank">Открыть PNG в полном размере</a></p></article>`;
}).join('\n');

await writeFile(join(dir, 'review.html'), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gazprom Arena — этап 5.1: визуальное ревью</title>
<style>
body{margin:0;padding:28px;background:#101725;color:#e5efff;font:16px/1.5 system-ui}
main{max-width:1600px;margin:auto}h1{font-size:28px}h2{font-size:18px}a{color:#79ceff}
.status{background:#20364b;padding:18px;border-radius:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr));gap:22px}
article{background:#172435;padding:16px;border:1px solid #35506b;border-radius:12px}
img{display:block;width:100%;max-height:650px;object-fit:contain;background:#0b1220}
</style></head><body><main>
<h1>Gazprom Arena Diorama · этап 5.1</h1>
<div class="status"><strong>Кандидаты — ожидают визуального утверждения</strong>
<p>Всего кадров: ${report.shots.length}. Проверки Vite: ${report.checks.filter(x => x.ok).length}/${report.checks.length}.
Ошибок консоли: ${report.consoleErrors.length}. ${escape(report.browser)}, ${escape(report.platform)}.</p>
<p>Проверьте архитектуру, расположение объектов, день/ночь, HUD и камеры Golf.
На кадре 15 панель приборов частично перекрывает Golf. Эта галерея не утверждает эталоны.</p>
<p><a href="report.json">Исходный отчёт JSON</a> ·
<a href="/">Открыть живую диораму (при просмотре через Vite)</a></p></div>
<div class="grid">${cards}</div></main></body></html>`, 'utf8');
console.log(`Review gallery: ${report.shots.length} images -> ${join(dir, 'review.html')}`);
