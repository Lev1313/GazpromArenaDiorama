import { readFile, writeFile } from 'node:fs/promises';
const folder = new URL('../browser-tests/_current/', import.meta.url);
const report = JSON.parse(await readFile(new URL('report.json', folder), 'utf8'));
const frames = [
  [2, 'Въезд с правого края', 'Первый гость появляется на восточной дороге. Остальные приезжают с интервалом 12 секунд.'],
  [30, 'Движение по кольцу', 'Гости следуют по внутренней полосе к верхнему заезду на парковку.'],
  [65, 'Парковка', 'Первый гость уже на месте, следующие заканчивают подъезд.'],
  [100, 'Обратный путь', 'После стоянки машины сдают назад, выезжают на внешнюю полосу кольца и возвращаются к правому краю.'],
];
await writeFile(new URL('visitors-review.html', folder), `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Газпром Арена — приезжающие машины</title>
<style>body{margin:24px auto;padding:0 20px;max-width:1400px;background:#101826;color:#edf4ff;font:18px/1.5 system-ui}section{background:#20364a;padding:20px;border-radius:14px;margin:20px 0}img{width:100%;height:auto}a{color:#66cfff}h1{font-size:30px}h2{font-size:24px}</style>
<h1>Приезжающие машины — визуальное ревью</h1>
<p>Три гостевые машины приезжают справа, паркуются и уезжают по дорожной сети. Постоянные машины автосходки, Golf и дрифтеры сохранены.</p>
<p>Браузерные проверки: ${report.checks.filter(c=>c.ok).length}/${report.checks.length}; успешный прогон: ${report.ok ? 'да' : 'нет'}. <a href="report.json">Отчёт</a>. Кадры сняты из настоящей сцены с управляемым временем; новые эталоны не утверждены.</p>
${frames.map(([second,title,description])=>`<section><h2>${title}</h2><p>${description}</p><a href="visitor-route-${second}.png"><img src="visitor-route-${second}.png" alt="${title}"></a></section>`).join('\n')}
</html>`, 'utf8');
console.log(new URL('visitors-review.html', folder).pathname);
