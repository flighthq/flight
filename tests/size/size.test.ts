import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import pc from 'picocolors';
import { build } from 'vite';
import { afterAll, describe, expect, test } from 'vitest';
import { gzipSync } from 'zlib';

const baselineFile = resolve(__dirname, 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';

const baseline: Record<string, number> = existsSync(baselineFile)
  ? JSON.parse(readFileSync(baselineFile, 'utf-8'))
  : {};

const pendingBaseline: Record<string, number> = { ...baseline };

const thresholds: Record<string, number> = {
  addinganimation: 9000,
  addingtext: 9000,
  animatedsprite: 6000,
  bunnymark: 6000,
  displayingabitmap: 7000,
  drawingshapes: 9000,
  nyancat: 7000,
  piratepig: 14000,
  simplesprite: 5000,
  tweenexample: 8000,
  usingtilemap: 5000,
};

const DEFAULT_THRESHOLD = 15000;
const RENDERERS = ['dom', 'canvas', 'webgl'] as const;
const examplesDir = resolve(__dirname, '../../examples');

const testCases = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(examplesDir, d.name, 'package.json')))
  .sort((a, b) => a.name.localeCompare(b.name))
  .flatMap(({ name }) =>
    RENDERERS.filter((r) => existsSync(resolve(examplesDir, name, `src/render.${r}.ts`))).map((render) => ({
      name,
      render,
      threshold: thresholds[name] ?? DEFAULT_THRESHOLD,
    })),
  );

interface SizeResult {
  name: string;
  render: string;
  gzipKB: string;
  baselineKB: string | null;
  delta: string | null;
  passed: boolean;
}

const results: SizeResult[] = [];
let lastPrintedExample = '';

const exampleNames = [...new Set(testCases.map((tc) => tc.name))];
const exampleBgColors = [pc.bgBlue, pc.bgMagenta, pc.bgCyan, pc.bgGreen];
const maxNameLen = Math.max(...exampleNames.map((n) => n.length));
const w = { name: maxNameLen + 5, render: 8, size: 10, base: 10 };

function printGroup(name: string): void {
  const group = results.filter((r) => r.name === name);
  const bgColor = exampleBgColors[exampleNames.indexOf(name) % exampleBgColors.length];

  const lines = group.map((r, i) => {
    const nameCell = i === 0 ? bgColor(' ' + r.name + ' ') + ''.padEnd(w.name - r.name.length - 2) : ''.padEnd(w.name);

    const deltaNum = r.delta != null ? parseFloat(r.delta) : null;
    const color = deltaNum == null ? pc.dim : deltaNum > 2 ? pc.red : deltaNum > 0 ? pc.yellow : pc.green;
    const deltaStr =
      r.delta == null ? pc.dim('—') : color(r.delta[0]) + color(r.delta.slice(1, -1)) + pc.dim(color('%'));

    const baselineStr = pc.dim((r.baselineKB ? '~' + r.baselineKB + ' KB' : '—').padEnd(w.base));
    const flag = r.passed ? '' : '  ' + pc.red('✗');

    return `${nameCell}  ${pc.dim(r.render.padEnd(w.render))}  ${(r.gzipKB + ' KB').padEnd(w.size)}  ${baselineStr}  ${deltaStr}${flag}`;
  });

  console.log(lines.join('\n') + '\n');  
}

describe('bundle size checks', () => {
  afterAll(() => {
    if (updateBaseline) {
      writeFileSync(baselineFile, JSON.stringify(pendingBaseline, null, 2) + '\n');
      console.log(`Baseline written to ${baselineFile}`);  
    }
  });

  afterEach(() => {
    if (results.length === 0) return;
    const last = results[results.length - 1];
    if (last.name === lastPrintedExample) return;
    const expected = testCases.filter((tc) => tc.name === last.name).length;
    const completed = results.filter((r) => r.name === last.name).length;
    if (completed === expected) {
      printGroup(last.name);
      lastPrintedExample = last.name;
    }
  });

  test.each(testCases)('$name ($render)', async ({ name, render, threshold }) => {
    const root = resolve(examplesDir, name);
    const code = await buildSample(root, render);
    const gzipSize = getGzipSize(code);
    const gzipKB = (gzipSize / 1024).toFixed(2);
    const key = `${name}:${render}`;
    const baselineSize = baseline[key];
    const baselineKB = baselineSize != null ? (baselineSize / 1024).toFixed(2) : null;
    const rawDelta = baselineSize != null ? (((gzipSize - baselineSize) / baselineSize) * 100).toFixed(1) : null;
    const delta = rawDelta != null ? (parseFloat(rawDelta) >= 0 ? `+${rawDelta}%` : `${rawDelta}%`) : null;
    const passed = updateBaseline || gzipSize < threshold;

    pendingBaseline[key] = gzipSize;
    results.push({ name, render, gzipKB, baselineKB, delta, passed });

    if (!updateBaseline) {
      expect(gzipSize, `${name} (${render}) exceeded limit (${gzipKB} KB > ${threshold / 1000} KB)`).toBeLessThan(
        threshold,
      );
    }
  });

  test('write baseline', () => {});
});

async function buildSample(root: string, render: string): Promise<string> {
  const prev = process.env.RENDER;
  process.env.RENDER = render;

  try {
    const result = await build({
      root,
      configFile: resolve(root, 'vite.config.ts'),
      build: {
        write: true,
        emptyOutDir: true,
        outDir: resolve(root, 'dist'),
      },
      logLevel: 'silent',
    });

    const jsFiles = (result as any).output.filter((f: any) => f.fileName.endsWith('.js'));  
    expect(jsFiles.length).toBeGreaterThan(0);

    const mainChunk = jsFiles.find((f: any) => f.fileName.includes('main')) || jsFiles[0];  
    return mainChunk.code;
  } finally {
    if (prev === undefined) {
      delete process.env.RENDER;
    } else {
      process.env.RENDER = prev;
    }
  }
}

function getGzipSize(code: string): number {
  return gzipSync(code).length;
}
