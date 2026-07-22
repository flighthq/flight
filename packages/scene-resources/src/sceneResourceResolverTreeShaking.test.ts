import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const resolveDir = fileURLToPath(new URL('.', import.meta.url));

async function bundleSceneResourceResolverExport(name: string): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${name} } from './index.ts';`,
      resolveDir,
      sourcefile: `${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

describe('scene resource resolver tree shaking', () => {
  it('keeps the primitive resolver independent of built-in material listers', async () => {
    const output = await bundleSceneResourceResolverExport('createSceneResourceResolver');
    expect(output).not.toContain('StandardPbrMaterial');
    expect(output).not.toContain('UnlitMaterial');
  });

  it('includes built-in material listers only through the named assembly', async () => {
    const output = await bundleSceneResourceResolverExport('createBuiltInSceneResourceResolver');
    expect(output).toContain('StandardPbrMaterial');
    expect(output).toContain('UnlitMaterial');
  });
});
