import { Buffer } from 'node:buffer';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Entity free-function tree shaking', () => {
  it('keeps allocateEntity within its runtime-only bundle budget', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: 'export { allocateEntity } from "@flighthq/entity";',
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'entity-free-function-entry.ts',
      },
      treeShaking: true,
      tsconfig: 'tsconfig.json',
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();

    const bundled = output!;
    expect(Buffer.byteLength(bundled)).toBeLessThanOrEqual(225);
    expect(bundled.match(/WeakMap/g)).toHaveLength(1);
    expect(bundled.match(/Symbol\.for/g)).toHaveLength(1);
    expect(bundled.match(/defineProperty/g)).toHaveLength(1);
    expect(bundled).not.toMatch(/\bclass\b/);
    expect(bundled).not.toContain('EntityRuntimePrivate');
    expect(bundled).not.toContain('binding');
    expect(bundled).not.toContain('more than one OOP wrapper');
    expect(bundled).not.toContain('uid');
  });
});
