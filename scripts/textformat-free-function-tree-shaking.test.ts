import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Textformat free-function tree shaking', () => {
  it('does not retain the target-native TextFormatRange companion', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: 'export { getTextFormatAscent } from "@flighthq/textformat";',
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'textformat-free-function-entry.ts',
      },
      treeShaking: true,
      tsconfig: 'tsconfig.json',
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();

    const bundled = output!;
    expect(bundled).not.toMatch(/\bclass\b/);
    expect(bundled).not.toContain('TextFormatRangeRaw is already attached');
    expect(bundled).not.toContain('Reflect.construct');
    expect(bundled).not.toContain('more than one OOP wrapper');
  });
});
