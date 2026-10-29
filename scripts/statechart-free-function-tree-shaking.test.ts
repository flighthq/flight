import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Statechart free-function tree shaking', () => {
  it('does not retain either target-native OOP companion', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: 'export { getStatechartRegionState } from "@flighthq/statechart";',
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'statechart-free-function-entry.ts',
      },
      treeShaking: true,
      tsconfig: 'tsconfig.json',
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();

    const bundled = output!;
    expect(bundled).not.toMatch(/\bclass\b/);
    expect(bundled).not.toContain('StatechartRaw is already attached');
    expect(bundled).not.toContain('StatechartInstanceRaw is already attached');
    expect(bundled).not.toContain('more than one OOP wrapper');
  });
});
