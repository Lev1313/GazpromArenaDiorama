// Reference screenshots + functional smoke checks for the diorama.
//
//   npm run baseline            -> writes baseline/screenshots/*.png and baseline/report.json
//   npm run baseline:verify     -> renders into baseline/_current/ and pixel-compares with the baseline
//   options: --url <page url>   (default: legacy/gazprom_arena_diorama.html via the built-in server)
//            --out <dir>        (override output directory)
//            --threshold <pct>  (verify: allowed mismatching pixels per shot, default 0.1 %)
//
// Determinism: requestAnimationFrame and performance.now are replaced with a manual clock,
// so every shot is taken after an exact number of 1/60 s frames. WebGL runs on SwiftShader
// (software), which gives identical pixels from run to run on the same machine.
import { chromium } from 'playwright-core';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pngjs from 'pngjs';
import pixelmatch from 'pixelmatch';
import { startServer } from './serve.mjs';

const { PNG } = pngjs;
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const verify = args.includes('--verify');
const root = resolve(import.meta.dirname, '..');
const baseDir = join(root, 'baseline');
const shotsRef = join(baseDir, 'screenshots');
const outDir = resolve(opt('--out', verify ? join(baseDir, '_current') : shotsRef));
const threshold = Number(opt('--threshold', '0.1'));
const PORT = 8766;

const CLOCK = `(() => {
  let now = 0, id = 0; const queue = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = cb => { queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = i => { queue.delete(i); };
  const stats = { calls: 0, triangles: 0 };
  const PRIM = { 4: 3, 5: 1, 6: 1 }; // TRIANGLES, STRIP, FAN -> rough triangle count
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const orig = C.prototype[fn]; if (!orig) continue;
      C.prototype[fn] = function (mode, a, b, c, d) {
        if (window.__skipDraw) return; // fast-forward: simulation runs, GPU work is skipped
        stats.calls++;
        const count = fn.startsWith('drawArrays') ? b : a;
        if (mode === 4) stats.triangles += count / 3; else if (PRIM[mode]) stats.triangles += Math.max(0, count - 2);
        return orig.apply(this, arguments);
      };
    }
  }
  // Remember the WebGL context so the GPU queue can be drained after each frame batch.
  let gl = null;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = getContext.call(this, type, attrs);
    if (ctx && /webgl/.test(type) && !gl) gl = ctx;
    return ctx;
  };
  window.__advance = (frames = 1, ms = 1000 / 60, skipDraw = false) => {
    for (let f = 0; f < frames; f++) {
      window.__skipDraw = skipDraw && f < frames - 1; // the last frame is always drawn
      now += ms; stats.calls = 0; stats.triangles = 0;
      const cbs = [...queue.values()]; queue.clear();
      for (const cb of cbs) cb(now);
    }
    gl?.finish();
    return { time: now, drawCalls: stats.calls, triangles: Math.round(stats.triangles) };
  };
  window.__errors = [];
  addEventListener('error', e => window.__errors.push(String(e.message || e)));
})();`;

const results = { shots: [], checks: [], frameStats: {}, consoleErrors: [] };
const check = (name, ok, detail = '') => { results.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function newPage(browser, url, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location()?.url ?? '')) results.consoleErrors.push(m.text()); });
  page.on('pageerror', e => results.consoleErrors.push(String(e)));
  await page.addInitScript(CLOCK);
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#stats')?.textContent.length > 0, null, { timeout: 60000 });
  return { context, page };
}

// Advance in small batches: SwiftShader renders slowly, and huge batches starve the compositor.
// Long spans are fast-forwarded without drawing (the simulation does not depend on rendering).
async function advance(page, frames = 1) {
  if (frames > 10) await page.evaluate(n => window.__advance(n, 1000 / 60, true), frames - 5);
  let s;
  for (let left = frames > 10 ? 5 : frames; left > 0; left -= 5) s = await page.evaluate(n => window.__advance(n), Math.min(5, left));
  return s;
}
const text = (page, sel) => page.locator(sel).textContent();
async function shot(page, name, frames = 2) {
  const s = await advance(page, frames);
  results.frameStats[name] = s;
  await page.screenshot({ path: join(outDir, name + '.png'), timeout: 120000 });
  results.shots.push(name);
  return s;
}

async function run() {
  await mkdir(outDir, { recursive: true });
  let server = null, url = opt('--url');
  if (!url) { server = await startServer({ port: PORT, root }); url = `http://127.0.0.1:${PORT}/legacy/gazprom_arena_diorama.html`; }
  results.url = url;
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  results.browser = 'msedge ' + browser.version();
  try {
    // ---------- Desktop ----------
    const { context, page } = await newPage(browser, url, { viewport: { width: 1400, height: 850 }, deviceScaleFactor: 1 });
    check('WebGL scene initialised, no #err message', (await text(page, '#err')) === '');
    check('Initial stats text', /Дрифт: 2 авто · на парковке: 18 · зрителей: 32/.test(await text(page, '#stats')), await text(page, '#stats'));

    // Let the simulation run 3 s, then freeze it so every preset shows the same moment.
    await advance(page, 180);
    await page.click('#pause');
    check('Pause button toggles label', (await text(page, '#pause')) === '▶ Продолжить');

    await shot(page, '01_overview_night', 10);
    for (const [id, name] of [['meet', '02_preset_meet'], ['arena', '03_preset_arena'], ['high', '04_preset_zsd'], ['map', '05_preset_top'], ['drift', '06_preset_drift']]) {
      await page.click('#' + id);
      await shot(page, name, 10);
    }
    await page.click('#reset');
    const resetStats = await shot(page, '07_reset_camera', 10);
    check('Reset camera reproduces overview draw calls', resetStats.drawCalls === results.frameStats['01_overview_night'].drawCalls, `${resetStats.drawCalls} draw calls`);

    // Day / night
    await page.click('#day');
    check('Day button switches label', (await text(page, '#day')) === '🌙 Ночь');
    await shot(page, '08_overview_day', 10);
    await page.click('#arena');
    await shot(page, '09_arena_day', 10);
    await page.click('#day');
    check('Night restored', (await text(page, '#day')) === '☀ День');
    await page.click('#reset');

    // Orbit drag changes the view.
    await page.mouse.move(800, 500); await page.mouse.down(); await page.mouse.move(950, 450, { steps: 8 }); await page.mouse.up();
    await shot(page, '10_orbit_drag', 60);
    const a = PNG.sync.read(await readFile(join(outDir, '01_overview_night.png')));
    const b = PNG.sync.read(await readFile(join(outDir, '10_orbit_drag.png')));
    check('Orbit drag rotates the camera', pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 }) > 10000);
    await page.click('#reset');

    // Resume simulation; animated scene must change.
    await page.click('#pause');
    check('Resume button restores label', (await text(page, '#pause')) === '⏸ Пауза');
    await page.click('#drift');
    await shot(page, '11_drift_t0', 2);
    await shot(page, '12_drift_t+2s', 120);
    const d0 = PNG.sync.read(await readFile(join(outDir, '11_drift_t0.png')));
    const d1 = PNG.sync.read(await readFile(join(outDir, '12_drift_t+2s.png')));
    check('Drifters / smoke animate over time', pixelmatch(d0.data, d1.data, null, d0.width, d0.height, { threshold: 0.1 }) > 2000);

    // Smoke toggle
    await page.click('#smoke');
    check('Smoke toggle off', (await text(page, '#smoke')) === 'Дым: выкл.');
    await shot(page, '13_drift_smoke_off', 30);
    await page.click('#smoke');
    check('Smoke toggle on', (await text(page, '#smoke')) === 'Дым: вкл.');

    // Tempo slider
    await page.locator('#speed').fill('2');
    check('Tempo slider accepts value', (await page.locator('#speed').inputValue()) === '2');
    await advance(page, 60);
    await page.locator('#speed').fill('1');

    // Stats update while running (visitors arrive and park).
    await advance(page, 60 * 40);
    const stats40 = await text(page, '#stats');
    check('Stats keep updating (visitor cars park)', /на парковке: (19|20|21)/.test(stats40), stats40);

    // ---------- Driving the Golf ----------
    await page.click('#reset');
    await page.click('#drive');
    check('Drive mode: panel visible', await page.locator('#drivePanel').isVisible());
    check('Drive mode: button label', (await text(page, '#drive')) === 'Выйти из Golf');
    check('Drive mode: body.driving class', await page.evaluate(() => document.body.classList.contains('driving')));
    await shot(page, '14_drive_chase', 5);
    await page.keyboard.press('KeyC');
    check('Camera view: Сверху', (await text(page, '#viewName')) === 'Сверху');
    await shot(page, '15_drive_top', 5);
    await page.keyboard.press('KeyC');
    check('Camera view: Свободно', (await text(page, '#viewName')) === 'Свободно');
    await page.keyboard.press('KeyC');
    check('Camera view cycles back: Сзади', (await text(page, '#viewName')) === 'Сзади');

    // The Golf starts facing the drift ellipse; a passing drifter can block it (original behaviour).
    // Retry from home position until the path is clear, deterministically.
    let kmh = 0, tries = 0;
    for (; tries < 12; tries++) {
      await page.keyboard.down('KeyW');
      await advance(page, 45);
      kmh = Number(await text(page, '#kmh'));
      if (kmh > 10) break;
      await page.keyboard.up('KeyW');
      await page.keyboard.press('KeyR');
      await advance(page, 60);
    }
    check('Throttle accelerates (km/h > 10, gear D)', kmh > 10 && (await text(page, '#gear')) === 'D', `${kmh} км/ч, попыток сброса: ${tries}`);
    await shot(page, '16_drive_moving', 1);
    await page.keyboard.down('Space');
    await advance(page, 30);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyW');
    await shot(page, '17_drive_after_brake_skids', 5);

    // Hold throttle until something is hit (drifters yield, parked cars block).
    await page.keyboard.down('KeyW');
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) { await advance(page, 15); hit = (await text(page, '#driveMessage')) === 'Препятствие — сдай назад'; }
    await page.keyboard.up('KeyW');
    check('Collision detection stops the Golf', hit, await text(page, '#driveMessage'));
    await shot(page, '18_drive_collision', 1);

    await page.keyboard.down('KeyS');
    await advance(page, 120);
    check('Reverse gear R', (await text(page, '#gear')) === 'R');
    await page.keyboard.up('KeyS');

    await page.keyboard.press('KeyR');
    await advance(page, 2);
    check('R resets Golf (0 km/h, N)', (await text(page, '#kmh')) === '0' && (await text(page, '#gear')) === 'N');
    await shot(page, '19_drive_reset', 3);

    await page.keyboard.press('Escape');
    check('Esc exits drive mode', (await page.locator('#drivePanel').isHidden()) && (await text(page, '#drive')) === 'За руль Golf VI');
    await shot(page, '20_after_exit_camera_restored', 3);

    // Photo sources panel
    await page.click('#photoSources summary');
    check('Photo sources panel lists 4 links', (await page.locator('#photoSources a').count()) === 4);
    await shot(page, '21_photo_sources_open', 1);

    check('No page errors (desktop)', results.consoleErrors.length === 0 && (await page.evaluate(() => window.__errors.length)) === 0, results.consoleErrors.join(' | '));
    await context.close();

    // ---------- Mobile (touch) ----------
    const mob = await newPage(browser, url, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await advance(mob.page, 180);
    await mob.page.click('#pause');
    await shot(mob.page, '22_mobile_overview', 10);
    await mob.page.click('#pause');
    await mob.page.click('#drive');
    check('Mobile: touch pedals visible in drive mode', await mob.page.locator('.touchControls').isVisible());
    await shot(mob.page, '23_mobile_drive', 10);
    await mob.context.close();
  } finally {
    await browser.close();
    server?.close();
  }

  results.ok = results.checks.every(c => c.ok);
  await writeFile(join(outDir, 'report.json'), JSON.stringify(results, null, 2));
  if (!verify) await writeFile(join(baseDir, 'report.json'), JSON.stringify(results, null, 2));

  if (verify) {
    const refReport = JSON.parse(await readFile(join(baseDir, 'report.json'), 'utf8'));
    console.log('\nPixel comparison against baseline/screenshots:');
    let allOk = true;
    for (const name of refReport.shots) {
      const refFile = join(shotsRef, name + '.png'), curFile = join(outDir, name + '.png');
      if (!existsSync(curFile)) { console.log(`MISSING ${name}`); allOk = false; continue; }
      const r = PNG.sync.read(await readFile(refFile)), c = PNG.sync.read(await readFile(curFile));
      if (r.width !== c.width || r.height !== c.height) { console.log(`SIZE    ${name}`); allOk = false; continue; }
      const diff = new PNG({ width: r.width, height: r.height });
      const n = pixelmatch(r.data, c.data, diff.data, r.width, r.height, { threshold: 0.1 });
      const pct = (100 * n) / (r.width * r.height);
      const ok = pct <= threshold;
      if (!ok) await writeFile(join(outDir, name + '.diff.png'), PNG.sync.write(diff));
      const dc = refReport.frameStats[name]?.drawCalls, dcc = results.frameStats[name]?.drawCalls;
      console.log(`${ok ? 'SAME' : 'DIFF'}    ${name.padEnd(32)} ${pct.toFixed(3)} %  draw calls ${dc} -> ${dcc}`);
      allOk &&= ok;
    }
    results.ok &&= allOk;
  }
  console.log(`\n${results.checks.filter(c => c.ok).length}/${results.checks.length} checks passed, ${results.shots.length} screenshots -> ${outDir}`);
  process.exitCode = results.ok ? 0 : 1;
}

await run();
