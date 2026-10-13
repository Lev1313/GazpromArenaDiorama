/**
 * Same-machine comparative WebGL benchmark: legacy HTML vs Vite.
 *
 * Captures GPU draw-call counts and submitted triangle estimates by wrapping
 * WebGL methods, plus frame callback CPU time and rAF intervals. Runs both
 * versions using the same installed Edge, viewport and SwiftShader backend.
 *
 * npm.cmd run perf:compare
 * Outputs performance/_current/report.json and report.md.
 * No reference screenshots are modified; metrics are NOT real gaming FPS.
 */
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'performance', '_current');
const scenes = [
  ['overview', 'reset'],
  ['meet', 'meet'],
  ['arena', 'arena'],
  ['zsd', 'high'],
  ['top', 'map'],
  ['drift', 'drift'],
];
const viewport = { width: 1400, height: 850 };
const sampleFrames = 20;

function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function rounded(n, digits = 2) {
  return n == null ? null : Number(n.toFixed(digits));
}

// Browser-side instrumentation is installed BEFORE legacy/Vite application
// scripts execute. A "frame" is an actual WebGL-rendering rAF callback.
function installMetrics() {
  const metric = { calls: 0, triangles: 0, started: 0 };
  const frames = [];
  const originalRAF = window.requestAnimationFrame.bind(window);
  window.__perfFrames = frames;
  window.requestAnimationFrame = callback => originalRAF(timestamp => {
    metric.calls = 0;
    metric.triangles = 0;
    metric.started = performance.now();
    try {
      callback(timestamp);
    } finally {
      const cpuMs = performance.now() - metric.started;
      if (metric.calls > 0) {
        frames.push({
          timestamp, drawCalls: metric.calls,
          triangles: Math.round(metric.triangles),
          callbackCpuMs: cpuMs,
        });
        if (frames.length > 300) frames.splice(0, frames.length - 300);
      }
    }
  });

  const countDraw = (mode, vertexCount, instances = 1) => {
    metric.calls++;
    const trianglesPerInstance =
      mode === 4 ? vertexCount / 3
        : (mode === 5 || mode === 6) ? Math.max(0, vertexCount - 2) : 0;
    metric.triangles += trianglesPerInstance * Math.max(1, instances);
  };
  for (const Context of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!Context) continue;
    const methods = [
      ['drawArrays', (mode, _first, count) => countDraw(mode, count)],
      ['drawElements', (mode, count) => countDraw(mode, count)],
      ['drawArraysInstanced', (mode, _first, count, instances) =>
        countDraw(mode, count, instances)],
      ['drawElementsInstanced', (mode, count, _type, _offset, instances) =>
        countDraw(mode, count, instances)],
    ];
    for (const [name, measure] of methods) {
      const original = Context.prototype[name];
      if (!original) continue;
      Context.prototype[name] = function (...args) {
        measure(...args);
        return original.apply(this, args);
      };
    }
  }
  window.__perfErrors = [];
  window.addEventListener('error', e =>
    window.__perfErrors.push(String(e.message || e)));
  window.addEventListener('unhandledrejection', e =>
    window.__perfErrors.push(String(e.reason || e)));
}

async function benchmarkVersion(browser, name, url) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon/.test(message.location()?.url || '')) {
      errors.push(message.text());
    }
  });
  await page.addInitScript(installMetrics);
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() =>
      document.querySelector('#stats')?.textContent?.length > 0,
    null, { timeout: 60000 });
    // Pause simulation, not rendering; compare the same static scene views.
    await page.click('#pause');
    await page.waitForFunction(() => document.querySelector('#pause')
      ?.textContent?.includes('Продолжить'), null, { timeout: 10000 });
    const results = {};
    for (const [sceneName, preset] of scenes) {
      await page.click('#' + preset);
      await page.evaluate(() => { window.__perfFrames.length = 0; });
      await page.waitForFunction(n => window.__perfFrames.length >= n,
        sampleFrames + 5, { timeout: 150000 });
      const frames = await page.evaluate(n =>
        window.__perfFrames.slice(-n), sampleFrames);
      const deltas = frames.slice(1).map((f, i) =>
        f.timestamp - frames[i].timestamp);
      results[sceneName] = {
        drawCallsMedian: median(frames.map(f => f.drawCalls)),
        trianglesMedian: median(frames.map(f => f.triangles)),
        callbackCpuMsMedian: rounded(median(frames.map(f => f.callbackCpuMs)), 3),
        rafIntervalMsMedian: rounded(median(deltas), 3),
        headlessRafHz: rounded(1000 / median(deltas)),
        samples: frames.length,
      };
      console.log(name.padEnd(7) + sceneName.padEnd(10) +
        'calls=' + results[sceneName].drawCallsMedian +
        ' triangles=' + results[sceneName].trianglesMedian +
        ' rAF≈' + results[sceneName].headlessRafHz + 'Hz');
    }
    const pageErrors = await page.evaluate(() => window.__perfErrors);
    if (errors.length || pageErrors.length) {
      throw new Error(name + ' page errors: ' +
        [...errors, ...pageErrors].join(' | ').slice(0, 1800));
    }
    return results;
  } finally {
    await context.close();
  }
}

function markdown(result) {
  const lines = [
    '# Legacy vs Vite — headless WebGL comparison',
    '',
    'Browser: ' + result.browser,
    'Viewport: 1400 × 850; DPR=1; software WebGL (SwiftShader).',
    '',
    '**Caution:** Headless rAF frequency and JS callback timing are not',
    'real gaming FPS or GPU frame latency. Do not infer user-visible',
    'performance from headless Hz alone. Compare per-view draw calls',
    'and triangles primarily; visuals must also be independently checked.',
    '',
    '| Scene | Legacy calls | Vite calls | Δ calls | Legacy triangles | Vite triangles |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const [name] of scenes) {
    const a = result.legacy[name], b = result.vite[name];
    lines.push('| ' + name + ' | ' + a.drawCallsMedian + ' | ' +
      b.drawCallsMedian + ' | ' +
      (b.drawCallsMedian - a.drawCallsMedian) + ' | ' +
      a.trianglesMedian + ' | ' + b.trianglesMedian + ' |');
  }
  lines.push('', 'Detailed frame timing estimates and environment metadata',
    'are in report.json. Do not change the approved screenshot references',
    'to accommodate a benchmark difference.', '');
  return lines.join('\n');
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const legacyServer = await startServer({ port: 0, root });
  let vite, browser;
  try {
    vite = await createViteServer({
      root, logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    await vite.listen();
    const viteAddr = vite.httpServer.address();
    const legacyAddr = legacyServer.address();
    if (!viteAddr || typeof viteAddr === 'string' ||
        !legacyAddr || typeof legacyAddr === 'string') {
      throw new Error('Local HTTP servers did not bind TCP ports.');
    }
    browser = await chromium.launch({
      channel: 'msedge', headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--force-color-profile=srgb', '--hide-scrollbars'],
    });
    const result = {
      browser: 'msedge ' + browser.version(),
      platform: process.platform, viewport, deviceScaleFactor: 1,
      sampleFrames, renderer: 'Headless Edge SwiftShader',
      limitations: 'rAF intervals are headless pacing, not real GPU FPS',
    };
    result.legacy = await benchmarkVersion(browser, 'legacy',
      'http://127.0.0.1:' + legacyAddr.port +
      '/legacy/gazprom_arena_diorama.html');
    result.vite = await benchmarkVersion(browser, 'vite',
      'http://127.0.0.1:' + viteAddr.port + '/');
    await writeFile(join(outputDir, 'report.json'),
      JSON.stringify(result, null, 2) + '\n');
    await writeFile(join(outputDir, 'report.md'), markdown(result));
    console.log('\nReport saved to performance/_current/report.md');
  } finally {
    await browser?.close();
    await vite?.close();
    await new Promise(resolve => legacyServer.close(resolve));
  }
}

main().catch(e => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
