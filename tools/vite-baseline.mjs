/**
 * Deterministic screenshot harness for the NEW Vite application.
 *
 * npm run vite:shots   -> candidate images in vite-baseline/_current/
 * npm run vite:approve -> promote manually reviewed images to references
 * npm run vite:verify  -> compare NEW captures to approved references
 *
 * This never modifies the original tools/baseline.mjs / baseline/screenshots.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import pngjs from 'pngjs';
import pixelmatch from 'pixelmatch';

const { PNG } = pngjs;
const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'vite-baseline');
const currentDir = join(dir, '_current');
const referenceDir = join(dir, 'screenshots');
const referenceFile = join(dir, 'reference.json');
const mode = process.argv.includes('--approve') ? 'approve'
  : process.argv.includes('--verify') ? 'verify' : 'shots';
const replace = process.argv.includes('--replace');
const thresholdPercent = 0.1;
const names = [
  '01_overview_night', '02_preset_meet', '03_preset_arena',
  '04_preset_zsd', '05_preset_top', '06_preset_drift',
  '07_reset_camera', '08_overview_day', '09_arena_day',
  '10_drift_smoke_off', '11_drive_chase', '12_drive_top',
  '13_photo_sources', '14_mobile_overview', '15_mobile_drive',
];

function head() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8',
  }).trim();
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function approve() {
  const current = JSON.parse(await readFile(join(currentDir, 'report.json'), 'utf8'));
  assert(current.ok, 'Failed candidate checks: rerun npm.cmd run vite:shots.');
  assert(current.head === head(),
    'Code changed since capture: rerun npm.cmd run vite:shots.');
  assert(JSON.stringify(current.shots) === JSON.stringify(names),
    'Candidate screenshot list is incomplete.');
  assert(replace || !existsSync(referenceFile),
    'Reference exists. An intentional update requires --replace.');
  await mkdir(referenceDir, { recursive: true });
  if (!replace) {
    const existing = (await readdir(referenceDir)).filter(f => f.endsWith('.png'));
    assert(existing.length === 0, 'Refusing to overwrite approved PNG images.');
  }
  for (const name of names) {
    assert(existsSync(join(currentDir, name + '.png')),
      'Missing candidate: ' + name);
  }
  for (const name of names) {
    await copyFile(join(currentDir, name + '.png'),
      join(referenceDir, name + '.png'));
  }
  await writeFile(referenceFile, JSON.stringify({
    ...current, approved: true, thresholdPercent,
  }, null, 2) + '\n');
  console.log('Approved ' + names.length + ' candidate screenshots.');
  console.log('Review and commit vite-baseline/screenshots/ and reference.json yourself.');
}

// Intercept requestAnimationFrame before Vite modules load; never use
// real clock time for simulation. SwiftShader matches the legacy harness.
function deterministicInit() {
  let now = 0, id = 0, gl = null;
  const queue = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = cb => { queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = n => queue.delete(n);
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = originalGetContext.call(this, type, attrs);
    if (ctx && /webgl/.test(type) && !gl) gl = ctx;
    return ctx;
  };
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const method of ['drawArrays', 'drawElements',
      'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = C.prototype[method];
      if (!original) continue;
      C.prototype[method] = function () {
        if (window.__skipDraw) return;
        return original.apply(this, arguments);
      };
    }
  }
  window.__advance = (frames = 1, skipDraw = false) => {
    for (let i = 0; i < frames; i++) {
      window.__skipDraw = skipDraw && i < frames - 1;
      now += 1000 / 60;
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(now);
    }
    window.__skipDraw = false;
    gl?.finish();
    return now;
  };
  window.__pageErrors = [];
  addEventListener('error', e => window.__pageErrors.push(String(e.message || e)));
  addEventListener('unhandledrejection',
    e => window.__pageErrors.push(String(e.reason || 'unhandled rejection')));
}
async function advance(page, frames = 1) {
  if (frames > 10) {
    await page.evaluate(n => window.__advance(n, true), frames - 5);
    frames = 5;
  }
  for (let left = frames; left > 0; left -= 5) {
    await page.evaluate(n => window.__advance(n), Math.min(left, 5));
  }
}
async function capture() {
  await mkdir(currentDir, { recursive: true });
  const results = {
    ok: false, head: head(), browser: '', platform: process.platform,
    shots: [], checks: [], consoleErrors: [], thresholdPercent,
  };
  const check = (label, ok) => {
    results.checks.push({ label, ok: Boolean(ok) });
    console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  };
  const vite = await createServer({
    root, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  let browser;
  try {
    await vite.listen();
    const address = vite.httpServer.address();
    assert(address && typeof address !== 'string', 'Vite did not open a local port.');
    const url = 'http://127.0.0.1:' + address.port + '/';
    browser = await chromium.launch({
      channel: 'msedge', headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--force-color-profile=srgb', '--hide-scrollbars'],
    });
    results.browser = 'msedge ' + browser.version();
    async function newPage(contextOptions) {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      page.on('console', m => {
        if (m.type() === 'error' && !/favicon/.test(m.location()?.url || '')) {
          results.consoleErrors.push(m.text());
        }
      });
      page.on('pageerror', e => results.consoleErrors.push(String(e)));
      await page.addInitScript(deterministicInit);
      await page.goto(url);
      await page.waitForFunction(() =>
        document.querySelector('#stats')?.textContent?.length > 0,
        null, { timeout: 60000 });
      return { context, page };
    }
    async function snap(page, name) {
      await advance(page, 2);
      await page.screenshot({
        path: join(currentDir, name + '.png'), timeout: 120000,
        animations: 'disabled',
      });
      results.shots.push(name);
      console.log('SHOT  ' + name);
    }

    const { context, page } = await newPage({
      viewport: { width: 1400, height: 850 }, deviceScaleFactor: 1,
    });
    check('Vite initializes new scene and full HUD',
      await page.locator('#view').count() === 1
      && await page.locator('#full-hud').count() === 1
      && await page.locator('#err').textContent() === '');
    check('Exactly one Golf button',
      await page.locator('#drive').count() === 1);
    check('Initial car and spectator statistics',
      /Дрифт: 2 авто · на парковке: 18 · зрителей: 32/.test(
        await page.locator('#stats').textContent()));
    check('Four links to original photo sources',
      await page.locator('#photoSources a[href]').count() === 4);
    await advance(page, 180);
    await page.click('#pause');
    check('Pause works', await page.locator('#pause').textContent() === '▶ Продолжить');

    await snap(page, '01_overview_night');
    for (const [id, name] of [
      ['meet', '02_preset_meet'], ['arena', '03_preset_arena'],
      ['high', '04_preset_zsd'], ['map', '05_preset_top'],
      ['drift', '06_preset_drift'], ['reset', '07_reset_camera'],
    ]) {
      await page.click('#' + id);
      await snap(page, name);
    }
    await page.click('#day');
    check('Day mode works',
      await page.locator('#day').textContent() === '🌙 Ночь');
    await snap(page, '08_overview_day');
    await page.click('#arena');
    await snap(page, '09_arena_day');
    await page.click('#day');
    await page.click('#drift');
    await page.click('#smoke');
    check('Smoke toggle works',
      await page.locator('#smoke').textContent() === 'Дым: выкл.');
    await snap(page, '10_drift_smoke_off');
    await page.click('#smoke');
    await page.click('#reset');

    await page.click('#drive');
    check('Golf HUD shown', await page.locator('#drivePanel').isVisible());
    await snap(page, '11_drive_chase');
    await page.click('#driveCamera');
    check('Golf top view works',
      await page.locator('#viewName').textContent() === 'Сверху');
    await snap(page, '12_drive_top');
    await page.click('#driveExit');
    await page.click('#photoSources summary');
    await snap(page, '13_photo_sources');
    await context.close();

    const mobile = await newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    });
    await advance(mobile.page, 180);
    await mobile.page.click('#pause');
    await snap(mobile.page, '14_mobile_overview');
    await mobile.page.click('#drive');
    check('Mobile pedals visible',
      await mobile.page.locator('.touchControls').isVisible());
    await snap(mobile.page, '15_mobile_drive');
    await mobile.context.close();

    check('No console/page errors', results.consoleErrors.length === 0);
    assert(results.shots.length === names.length, 'Screenshot count mismatch.');
    results.ok = results.checks.every(c => c.ok);
  } finally {
    await browser?.close();
    await vite.close();
    await writeFile(join(currentDir, 'report.json'),
      JSON.stringify(results, null, 2) + '\n');
  }
  if (mode === 'verify') {
    assert(existsSync(referenceFile),
      'No Vite reference yet. Run vite:shots, review, then vite:approve.');
    const reference = JSON.parse(await readFile(referenceFile, 'utf8'));
    assert(reference.approved
      && JSON.stringify(reference.shots) === JSON.stringify(names),
    'Approved reference manifest does not match scenario list.');
    console.log('\nComparing new Vite screenshots:');
    let allEqual = true;
    for (const name of names) {
      const refPath = join(referenceDir, name + '.png');
      assert(existsSync(refPath), 'Missing approved PNG: ' + name);
      const a = PNG.sync.read(await readFile(refPath));
      const b = PNG.sync.read(await readFile(join(currentDir, name + '.png')));
      if (a.width !== b.width || a.height !== b.height) {
        console.log('SIZE  ' + name); allEqual = false; continue;
      }
      const diff = new PNG({ width: a.width, height: a.height });
      const changed = pixelmatch(a.data, b.data, diff.data,
        a.width, a.height, { threshold: .1 });
      const percent = 100 * changed / (a.width * a.height);
      const ok = percent <= thresholdPercent;
      console.log((ok ? 'SAME  ' : 'DIFF  ') + name
        + '  ' + percent.toFixed(3) + ' %');
      if (!ok) {
        allEqual = false;
        await writeFile(join(currentDir, name + '.diff.png'), PNG.sync.write(diff));
      }
    }
    results.ok &&= allEqual;
  }
  console.log('\n' + results.checks.filter(x => x.ok).length
    + '/' + results.checks.length + ' checks passed; '
    + results.shots.length + ' Vite screenshots -> ' + currentDir);
  if (!results.ok) process.exitCode = 1;
}

try {
  if (mode === 'approve') await approve();
  else await capture();
} catch (e) {
  console.error('Vite baseline failed: ' + (e?.stack || e));
  process.exitCode = 1;
}
