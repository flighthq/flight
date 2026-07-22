import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const resolveDir = import.meta.dirname;

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
      sourcefile: `tree-shake-${name}.ts`,
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
    expect(output).not.toContain('image resource resolution failed');
  });

  it('includes built-in material listers only through the named assembly', async () => {
    const output = await bundleSceneResourceResolverExport('createBuiltInSceneResourceResolver');
    expect(output).toContain('StandardPbrMaterial');
    expect(output).toContain('UnlitMaterial');
  });

  it('includes failure logging only through the separately imported guard', async () => {
    const output = await bundleSceneResourceResolverExport('enableSceneResourceFailureGuards');
    expect(output).toContain('image resource resolution failed');
  });
});
