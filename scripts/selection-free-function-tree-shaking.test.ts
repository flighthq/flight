import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Selection free-function tree shaking', () => {
  it('does not retain unrelated gesture and pointer-policy cores', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      metafile: true,
      minify: true,
      platform: 'browser',
      stdin: {
        contents: 'export { getSelectionCount } from "@flighthq/selection";',
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'selection-free-function-entry.ts',
      },
      treeShaking: true,
      tsconfig: 'tsconfig.json',
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();

    const retainedInputs = Object.values(result.metafile!.outputs)[0]!.inputs;
    for (const source of ['lassoSelection.ts', 'marqueeSelection.ts', 'pointerSelectionPolicy.ts']) {
      const input = Object.entries(retainedInputs).find(([path]) => path.endsWith(`/selection/src/${source}`));
      expect(input?.[1].bytesInOutput ?? 0, source).toBe(0);
    }
    expect(output).not.toContain('evenOdd');
    expect(output).not.toContain('intersect');
  });
});
