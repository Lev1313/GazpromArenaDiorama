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
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
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
const sampleFrames = 30;
const warmupFrames = 10;
const repetitions = 3;

function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function rounded(n, digits = 2) {
  return n == null ? null : Number(n.toFixed(digits));
}
function percentile95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * .95) - 1];
}
function summarize(frames, deltas) {
  if (!frames.length || !deltas.length || frames.some(f =>
    f.drawCalls <= 0 || f.triangles <= 0 || !Number.isFinite(f.callbackCpuMs))
    || deltas.some(n => !Number.isFinite(n) || n <= 0)) {
    throw new Error('Invalid or empty frame measurements');
  }
  return {
    drawCallsMedian: median(frames.map(f => f.drawCalls)),
    drawCallsRange: [Math.min(...frames.map(f => f.drawCalls)), Math.max(...frames.map(f => f.drawCalls))],
    trianglesMedian: median(frames.map(f => f.triangles)),
    callbackCpuMsMedian: rounded(median(frames.map(f => f.callbackCpuMs)), 3),
    callbackCpuMsP95: rounded(percentile95(frames.map(f => f.callbackCpuMs)), 3),
    rafIntervalMsMedian: rounded(median(deltas), 3),
    rafIntervalMsP95: rounded(percentile95(deltas), 3),
    headlessRafHz: rounded(1000 / median(deltas)),
    samples: frames.length,
  };
}

// Browser-side instrumentation is installed BEFORE legacy/Vite application
// scripts execute. A "frame" is an actual WebGL-rendering rAF callback.
function installMetrics() {
  const metric = { calls: 0, triangles: 0, started: 0 };
  const frames = [];
  const originalRAF = window.requestAnimationFrame.bind(window);
  const originalCancel = window.cancelAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let manual = true, now = 0, id = 0, skipDraw = false, gl = null;
  const pending = new Map();
  performance.now = () => manual ? now : realNow();
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const context = getContext.call(this, type, attrs);
    if (/webgl/.test(type) && context) gl = context;
    return context;
  };
  window.__perfFrames = frames;
  const measured = callback => timestamp => {
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
  };
  window.requestAnimationFrame = callback => {
    if (manual) { pending.set(++id, callback); return id; }
    return originalRAF(measured(callback));
  };
  window.cancelAnimationFrame = token => manual ? pending.delete(token) : originalCancel(token);
  // Bootstrap both simulations to exactly 3 seconds before pausing them.
  // Timing samples below use native rAF/performance.now and render every frame.
  window.__perfPrepare = () => {
    for (let frame = 0; frame < 180; frame++) {
      now += 1000 / 60;
      skipDraw = frame < 179;
      const callbacks = [...pending.values()]; pending.clear();
      for (const callback of callbacks) callback(now);
    }
    skipDraw = false;
    gl?.finish();
    document.querySelector('#pause').click();
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const environment = {
      simulationSeconds: 3,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR),
    };
    manual = false;
    performance.now = realNow;
    for (const callback of pending.values()) originalRAF(measured(callback));
    pending.clear();
    return environment;
  };

  const countDraw = (mode, vertexCount, instances = 1) => {
    metric.calls++;
    const trianglesPerInstance =
      mode === 4 ? vertexCount / 3
        : (mode === 5 || mode === 6) ? Math.max(0, vertexCount - 2) : 0;
    metric.triangles += trianglesPerInstance * instances;
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
        if (skipDraw) return;
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
    const environment = await page.evaluate(() => window.__perfPrepare());
    if (!/SwiftShader/i.test(environment.renderer || '')) {
      throw new Error('Expected SwiftShader, got ' + environment.renderer);
    }
    await page.waitForFunction(() => document.querySelector('#pause')
      ?.textContent?.includes('Продолжить'), null, { timeout: 10000 });
    const results = {};
    for (const [sceneName, preset] of scenes) {
      await page.click('#' + preset);
      await page.evaluate(() => { window.__perfFrames.length = 0; });
      await page.waitForFunction(n => window.__perfFrames.length >= n,
        sampleFrames + warmupFrames, { timeout: 150000 });
      const frames = await page.evaluate(n =>
        window.__perfFrames.slice(-n), sampleFrames);
      const deltas = frames.slice(1).map((f, i) =>
        f.timestamp - frames[i].timestamp);
      results[sceneName] = { ...summarize(frames, deltas), frames };
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
    return { environment, views: results };
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
    'Production Vite build vs untouched legacy; simulation paused at t=3s.',
    'Three sequential repetitions, alternating version order; 10 warmup + 30 measured frames per view/run.',
    'Draw calls/triangles include shadow passes; triangles are submitted primitives, not unique scene geometry.',
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
  lines.push('', '| Scene | Legacy callback median / p95 ms | Vite callback median / p95 ms | Legacy rAF median ms | Vite rAF median ms |',
    '| --- | ---: | ---: | ---: | ---: |');
  for (const [name] of scenes) {
    const a = result.legacy[name], b = result.vite[name];
    lines.push(`| ${name} | ${a.callbackCpuMsMedian} / ${a.callbackCpuMsP95} | ${b.callbackCpuMsMedian} / ${b.callbackCpuMsP95} | ${a.rafIntervalMsMedian} | ${b.rafIntervalMsMedian} |`);
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
    const dist = join(root, 'dist');
    await readFile(join(dist, 'index.html')); // fail clearly if build is missing
    vite = await startServer({ port: 0, root: dist });
    const viteAddr = vite.address();
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
      sampleFrames, warmupFrames, repetitions, renderer: 'Headless Edge SwiftShader',
      generatedAt: new Date().toISOString(),
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      workingTree: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(),
      machine: { cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: rounded(os.totalmem() / 2 ** 30), osRelease: os.release(), node: process.version },
      limitations: 'Paused static views only, no driving/simulation cost. Instrumented callback wall time includes possible WebGL submission blocking; not pure CPU time. rAF intervals are headless pacing, not real GPU FPS. No GPU timer queries. No load-time or memory-growth benchmark.',
      sourceHashes: {}, runs: [],
    };
    for (const path of ['legacy/gazprom_arena_diorama.html', 'tools/perf-compare.mjs', 'dist/index.html',
      ...(await readdir(join(dist, 'assets'))).map(name => 'dist/assets/' + name)]) {
      result.sourceHashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
    }
    const urls = {
      legacy: 'http://127.0.0.1:' + legacyAddr.port + '/legacy/gazprom_arena_diorama.html',
      vite: 'http://127.0.0.1:' + viteAddr.port + '/',
    };
    for (let repeat = 0; repeat < repetitions; repeat++) {
      const order = repeat % 2 ? ['vite', 'legacy'] : ['legacy', 'vite'];
      for (const version of order) {
        console.log(`Run ${repeat + 1}/${repetitions}: ${version}`);
        result.runs.push({ repeat: repeat + 1, version,
          ...await benchmarkVersion(browser, version, urls[version]) });
      }
    }
    for (const version of ['legacy', 'vite']) {
      result[version] = {};
      for (const [name] of scenes) {
        const batches = result.runs.filter(r => r.version === version).map(r => r.views[name].frames);
        const deltas = batches.flatMap(frames => frames.slice(1).map((f, i) => f.timestamp - frames[i].timestamp));
        result[version][name] = summarize(batches.flat(), deltas);
        if (result[version][name].drawCallsRange[0] !== result[version][name].drawCallsRange[1]) {
          throw new Error(`Unstable static draw counts: ${version}/${name}`);
        }
      }
    }
    result.ok = true;
    await writeFile(join(outputDir, 'report.json'),
      JSON.stringify(result, null, 2) + '\n');
    await writeFile(join(outputDir, 'report.md'), markdown(result));
    console.log('\nReport saved to performance/_current/report.md');
  } finally {
    await browser?.close();
    if (vite) await new Promise(resolve => vite.close(resolve));
    await new Promise(resolve => legacyServer.close(resolve));
  }
}

main().catch(e => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
