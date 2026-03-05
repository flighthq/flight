import { resolve } from 'path';
import { build } from 'vite';
import { expect, test } from 'vitest';
import { gzipSync } from 'zlib';

describe('bundle size checks', () => {
  test.each([
    { name: 'displayingabitmap - functional', path: 'displayingabitmap', threshold: 7000 },
    { name: 'displayingabitmap - wrapper', path: '../../examples/displayingabitmap', threshold: 15000 },
  ])('$name', async ({ name, path, threshold }) => {
    const code = await buildSample(resolve(__dirname, path));
    const rawSize = getRawSize(code);
    const gzipSize = getGzipSize(code);
    const gzipSizeKB = (gzipSize / 1024).toFixed(2);

    console.log(`${name}: ${gzipSizeKB} KB gzipped (raw ${rawSize} bytes)`); // eslint-disable-line

    expect(gzipSize, `${name} exceeded limit (${gzipSizeKB} KB > ${threshold / 1000} KB)`).toBeLessThan(threshold);
  });
});

async function buildSample(root: string): Promise<string> {
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

  const jsFiles = result.output.filter((f) => f.fileName.endsWith('.js'));
  expect(jsFiles.length).toBeGreaterThan(0);

  const mainChunk = jsFiles.find((f) => f.fileName.includes('main')) || jsFiles[0];
  const code = mainChunk.code;
  return code;
}

function getGzipSize(code: string): number {
  const gzipped = gzipSync(code);
  return gzipped.length;
}

function getRawSize(code: string): number {
  return Buffer.byteLength(code, 'utf-8');
}
