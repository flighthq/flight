import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { build } from 'vite';
import { describe, expect, test } from 'vitest';
import { gzipSync } from 'zlib';

const baselineFile = resolve(__dirname, 'size.baseline.json');
const updateBaseline = process.env.UPDATE_BASELINE === '1';

const baseline: Record<string, number> = existsSync(baselineFile)
  ? JSON.parse(readFileSync(baselineFile, 'utf-8'))
  : {};

const pendingBaseline: Record<string, number> = { ...baseline };

const examples = [
  { name: 'addinganimation', threshold: 9000 },
  { name: 'addingtext', threshold: 9000 },
  { name: 'animatedsprite', threshold: 6000 },
  { name: 'bunnymark', threshold: 6000 },
  { name: 'displayingabitmap', threshold: 7000 },
  { name: 'drawingshapes', threshold: 9000 },
  { name: 'nyancat', threshold: 7000 },
  { name: 'piratepig', threshold: 13000 },
  { name: 'simplesprite', threshold: 5000 },
  { name: 'tweenexample', threshold: 8000 },
  { name: 'usingtilemap', threshold: 5000 },
];

const domSupported = new Set([
  'addinganimation',
  'addingtext',
  'displayingabitmap',
  'drawingshapes',
  'nyancat',
  'piratepig',
  'tweenexample',
]);

const testCases = examples.flatMap(({ name, threshold }) => {
  const renders = ['canvas', ...(domSupported.has(name) ? ['dom'] : [])];
  return renders.map((render) => ({ name, render, threshold }));
});

describe('bundle size checks', () => {
  test.each(testCases)('$name ($render)', async ({ name, render, threshold }) => {
    const root = resolve(__dirname, `../../examples/${name}`);
    const code = await buildSample(root, render);
    const gzipSize = getGzipSize(code);
    const gzipSizeKB = (gzipSize / 1024).toFixed(2);
    const key = `${name}:${render}`;
    const baselineSize = baseline[key];
    const baselineStr = baselineSize != null ? ` (expected: ~${(baselineSize / 1024).toFixed(2)} KB)` : '';

    console.log(`${name} (${render}): ${gzipSizeKB} KB gzipped${baselineStr}`); // eslint-disable-line

    pendingBaseline[key] = gzipSize;

    if (!updateBaseline) {
      expect(gzipSize, `${name} (${render}) exceeded limit (${gzipSizeKB} KB > ${threshold / 1000} KB)`).toBeLessThan(
        threshold,
      );
    }
  });

  test('write baseline', () => {
    if (updateBaseline) {
      writeFileSync(baselineFile, JSON.stringify(pendingBaseline, null, 2) + '\n');
      console.log(`Baseline written to ${baselineFile}`); // eslint-disable-line
    }
  });
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

    const jsFiles = (result as any).output.filter((f: any) => f.fileName.endsWith('.js')); // eslint-disable-line
    expect(jsFiles.length).toBeGreaterThan(0);

    const mainChunk = jsFiles.find((f: any) => f.fileName.includes('main')) || jsFiles[0]; // eslint-disable-line
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
