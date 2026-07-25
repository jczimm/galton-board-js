#!/usr/bin/env node
// Drives from-stl.html over a grid of URL params and collects the resulting
// CSVs into analysis/data. The sim page does the work -- this only opens tabs,
// waits for window.__simDone, and writes window.__simResult.csv to disk.
//
//   pnpm sweep --balls 800 --seed 1,2,3,4,5
//   pnpm sweep --balls 800 --seed 1,2,3 --ballRest .7,.85 --concurrency 2
//   pnpm sweep --balls 200 --seed 1 --headed        # watch one run
//
// Every sim param takes a comma-separated list; the grid is their cartesian
// product. Runs whose output file already exists are skipped, so an
// interrupted sweep can just be re-run.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'analysis', 'data');

// params the sim page understands; anything here can be swept
const SIM_PARAMS = [
  'model', 'seed', 'balls', 'ballRest', 'ballFric',
  'paneRest', 'paneFric', 'boardRest', 'boardFric',
  'tilt', 'spawnSpread', 'gravity', 'maxSteps',
];

function parseArgs(argv) {
  const opts = { concurrency: 2, headed: false, timeout: 900, baseUrl: null, dryRun: false };
  const grid = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'headed' || key === 'dry-run') {
      opts[key === 'dry-run' ? 'dryRun' : 'headed'] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) throw new Error(`--${key} needs a value`);
    if (SIM_PARAMS.includes(key)) grid[key] = value.split(',').map(s => s.trim());
    else if (key === 'concurrency' || key === 'timeout') opts[key] = Number(value);
    else if (key === 'base-url') opts.baseUrl = value;
    else throw new Error(`unknown option --${key} (sim params: ${SIM_PARAMS.join(', ')})`);
  }
  return { opts, grid };
}

function cartesian(grid) {
  return Object.entries(grid).reduce(
    (acc, [key, values]) => acc.flatMap(row => values.map(v => ({ ...row, [key]: v }))),
    [{}],
  );
}

// Vite prints the port it actually bound, which may not be 5173 if something
// else already has it -- so parse rather than assume.
function startDevServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['dev'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

    const fail = (err) => {
      // otherwise every failed start leaks a vite that holds a port, and the
      // next attempt fails too
      proc.kill();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('dev server did not start within 30s')), 30_000);

    // Vite colourises its output, and the escape codes land *inside* the port
    // number (`localhost:<esc>[1m5173<esc>[22m/`), so strip them before
    // matching -- whether colour is on depends on the environment, not on us.
    // Accumulate too, since the line can arrive split across chunks.
    let out = '';
    proc.stdout.on('data', chunk => {
      out += String(chunk).replace(/\x1b\[[0-9;]*m/g, '');
      const match = out.match(/http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ proc, baseUrl: `http://localhost:${match[1]}` });
      }
    });

    proc.on('error', fail);
    proc.on('exit', code => fail(new Error(`dev server exited with code ${code}`)));
  });
}

// Playwright's own timeouts assume a live browser. If the browser process dies
// underneath us the wait can sit forever, which stalls the whole sweep -- so
// race every run against a wall-clock deadline nothing can miss.
function hardDeadline(ms, label) {
  return new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error(`hard timeout after ${Math.round(ms / 1000)}s (${label})`)), ms);
    t.unref();
  });
}

function runOne(context, baseUrl, combo, timeoutSec, existingFiles) {
  return Promise.race([
    attemptRun(context, baseUrl, combo, timeoutSec, existingFiles),
    hardDeadline((timeoutSec + 120) * 1000, new URLSearchParams(combo).toString()),
  ]);
}

async function attemptRun(context, baseUrl, combo, timeoutSec, existingFiles) {
  const query = new URLSearchParams({ autorun: '1', ...combo }).toString();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(`${baseUrl}/from-stl.html?${query}`, { waitUntil: 'domcontentloaded' });

    // The page resolves its own defaults, so ask it for the run key rather than
    // duplicating them here. The final filename is this key plus the
    // settled/steps suffix, so a prefix match tells us the run is already done
    // before we pay for it.
    await page.waitForFunction('window.__simRunKey', null, { timeout: 60_000 });
    const runKey = await page.evaluate('window.__simRunKey');
    const prefix = `fromstl_${runKey}_settled-`;
    const already = existingFiles.find(f => f.startsWith(prefix));
    if (already) return { skipped: already };

    await page.waitForFunction('window.__simDone === true', null, { timeout: timeoutSec * 1000 });
    return await page.evaluate('window.__simResult');
  } catch (err) {
    // a page error (wasm/webgl/STL failure) is the usual cause of a timeout,
    // and is far more informative than the timeout itself
    throw new Error(errors.length ? `${errors[0]}` : err.message);
  } finally {
    await page.close();
  }
}

async function main() {
  const { opts, grid } = parseArgs(process.argv.slice(2));
  const combos = cartesian(grid);
  if (!combos.length) throw new Error('empty grid');

  console.log(`${combos.length} run(s), concurrency ${opts.concurrency}`);
  if (opts.dryRun) {
    for (const c of combos) console.log('  ', new URLSearchParams(c).toString());
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });

  let server = null;
  let baseUrl = opts.baseUrl;
  if (!baseUrl) {
    server = await startDevServer();
    baseUrl = server.baseUrl;
    console.log(`started dev server at ${baseUrl}`);
  }

  const browser = await chromium.launch({
    headless: !opts.headed,
    args: [
      // headless chromium has no real GPU; SwiftShader gives us the WebGL
      // context three.js insists on, and the sim only draws every 10th frame
      '--enable-unsafe-swiftshader',
      // rAF must keep firing at full rate even when the page isn't foreground
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const context = await browser.newContext();

  const existingFiles = await readdir(DATA_DIR);
  const queue = [...combos];
  const results = { written: 0, skipped: 0, failed: 0, unsettled: 0 };
  let index = 0;

  const worker = async () => {
    while (queue.length) {
      const combo = queue.shift();
      const n = ++index;
      const label = new URLSearchParams(combo).toString();
      const started = Date.now();
      try {
        const result = await runOne(context, baseUrl, combo, opts.timeout, existingFiles);
        if (result.skipped) {
          results.skipped++;
          console.log(`[${n}/${combos.length}] skip (exists) ${result.skipped}`);
          continue;
        }
        await writeFile(path.join(DATA_DIR, result.filename), result.csv);
        existingFiles.push(result.filename);
        results.written++;
        if (!result.settled) results.unsettled++;
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `[${n}/${combos.length}] ${result.settled ? 'settled' : 'UNSETTLED (hit maxSteps)'} ` +
          `at step ${result.steps}, ${result.ballsRemaining} balls, ${secs}s -> ${result.filename}`,
        );
      } catch (err) {
        results.failed++;
        console.error(`[${n}/${combos.length}] FAILED ${label}: ${err.message}`);
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  } finally {
    await browser.close();
    server?.proc.kill();
  }

  console.log(
    `done: ${results.written} written, ${results.skipped} skipped, ${results.failed} failed` +
    (results.unsettled ? `, ${results.unsettled} hit maxSteps without settling` : ''),
  );
  if (results.failed) process.exitCode = 1;
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
