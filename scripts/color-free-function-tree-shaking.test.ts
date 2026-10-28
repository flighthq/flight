import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Color free-function tree shaking', () => {
  it('does not retain the target-native LinearColor companion', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: 'export { lerpColor } from "@flighthq/color";',
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'color-free-function-entry.ts',
      },
      treeShaking: true,
      tsconfig: 'tsconfig.json',
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();

    const bundled = output!;
    expect(bundled).not.toMatch(/\bclass\b/);
    expect(bundled).not.toContain('Cannot create LinearColor');
    expect(bundled).not.toContain('more than one OOP wrapper');
  });
});
