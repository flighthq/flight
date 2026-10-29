import { Buffer } from 'node:buffer';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const CASES = [
  { exportName: 'parseXmlAttributes', maximumBytes: 600 },
  { exportName: 'parseXmlDocument', maximumBytes: 3700 },
] as const;

describe('XML parser focused bundle size', () => {
  it.each(CASES)('keeps $exportName below $maximumBytes minified bytes', async ({ exportName, maximumBytes }) => {
    const result = await build({
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: `export { ${exportName} } from './packages/xml/src/contract.ts';`,
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: `${exportName}.ts`,
      },
      target: 'es2022',
      treeShaking: true,
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();
    expect(Buffer.byteLength(output!), exportName).toBeLessThanOrEqual(maximumBytes);
  });
});
