// Review only: approved references are never changed by this script.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const roads = process.argv.includes('--roads');
const heading = roads ? 'Этап 6.3 — проезд между парковкой и ареной' : 'Этап 6.2 — основание стадиона';
const dir = join(root, 'vite-baseline/_current');
const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
const views = ['05_preset_top', '09_arena_day', '03_preset_arena', '02_preset_meet'];
const labels = ['Вид сверху', 'Арена днём', 'Арена ночью', 'Со стороны автосходки'];
await mkdir(join(dir, 'before-base'), { recursive: true });
for (const name of views) {
  await writeFile(join(dir, 'before-base', name + '.png'), execFileSync('git',
    ['show', `0f4b903:vite-baseline/screenshots/${name}.png`], { cwd: root, maxBuffer: 5 * 1024 * 1024 }));
}
const cards = views.map((name, i) => `<article><h2>${labels[i]}</h2><div class="pair">
<figure><figcaption>До — утверждённый этап 6.1</figcaption><a href="before-base/${name}.png"><img src="before-base/${name}.png" alt="До: ${labels[i]}"></a></figure>
<figure><figcaption>После — кандидат ${roads ? '6.3' : '6.2'}</figcaption><a href="${name}.png"><img src="${name}.png" alt="После: ${labels[i]}"></a></figure>
</div></article>`).join('\n');
const output = roads ? 'roads-review.html' : 'base-review.html';
await writeFile(join(dir, output), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title><style>
body{margin:24px;background:#101725;color:#e5efff;font:16px/1.5 system-ui}main{max-width:1800px;margin:auto}a{color:#79ceff}
article{margin:24px 0;background:#20364b;padding:16px;border-radius:12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
figure{margin:0}img{width:100%;display:block}h2{font-size:20px}@media(max-width:850px){.pair{grid-template-columns:1fr}}
</style></head><body><main><h1>${heading}</h1>
${roads ? '<p>Кольцевая дорога и все три заезда имеют ширину 6 единиц сцены. Верхний и нижний заезды зеркальны, средний расположен на оси стадиона. Края прямые и параллельные, разметка единообразная. Для центрального проезда один автомобиль и два зрителя переставлены к северному краю парковки, фонари и ограждения отведены от проезда. Golf может пользоваться всеми тремя заездами и всей шириной кольца. Между парковкой и кольцом сохранён зазор 3 единицы. Сравнение ниже — с последним утверждённым эталоном 6.1, поэтому также показывает предшествующие изменения основания.</p>' : ''}
<p>Ожидает визуального утверждения. Вертикальная облицовка цоколя, цельные лестничные марши, ограждения площадки и поручни.
Газоны размещены между лестницами. У восьми мачт убраны свободно висящие нижние концы: теперь они заканчиваются на чаше стадиона.
Платформы с навесами и опорами убраны с кольцевой дороги. Высота площадки и максимальный радиус цоколя сохранены.</p>
${roads ? '<p>Новый восточный подъезд продолжает нижнюю дугу кольца к правому краю диорамы. Ширина 6 единиц, две полосы; открыт проезд через край площадки. Основа — спутниковая карта заказчика и <a href="https://podd.kt.gov.spb.ru/restrict/6904375/">городской источник о Южной дороге и Футбольной аллее</a>. Это сжатая интерпретация дорожной схемы. Автоматические маршруты машин пока прежние; въезд с востока подготовлен для следующего этапа.</p>' : ''}
<p>Архитектурная интерпретация для диорамы, не обмерная реконструкция.
Основа: <a href="https://gazprom-arena.com/locations/parkovki">официальная фотография со стороны парковки</a>.</p>
<p>Снято ${report.shots.length} кадров; проверки съёмки ${report.checks.filter(c => c.ok).length}/${report.checks.length}.
<a href="report.json">Отчёт</a> · <a href="/">Живая диорама через Vite</a>.</p>
${cards}<h2>Все новые кадры</h2><p>${report.shots.map(name => `<a href="${encodeURIComponent(name)}.png">${name}</a>`).join(' · ')}</p>
</main></body></html>`, 'utf8');
console.log(`Created vite-baseline/_current/${output}`);
