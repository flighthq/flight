import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('Flow free-function tree shaking', () => {
  it('does not retain the target-native FlowStack companion', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      minify: true,
      platform: 'browser',
      stdin: {
        contents: 'export { createFlowStack } from "@flighthq/flow";',
        loader: 'ts',
        resolveDir: process.cwd(),
        sourcefile: 'flow-free-function-entry.ts',
      },
      treeShaking: true,
      tsconfig: 'tsconfig.json',
      write: false,
    });
    const output = result.outputFiles[0]?.text;
    expect(output).toBeDefined();

    const bundled = output!;
    expect(bundled).not.toMatch(/\bclass\b/);
    expect(bundled).not.toContain('FlowStackRaw is already attached');
    expect(bundled).not.toContain('more than one OOP wrapper');
  });
});
