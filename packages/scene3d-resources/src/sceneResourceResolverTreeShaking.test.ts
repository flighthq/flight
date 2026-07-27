// @vitest-environment node

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const resolveDir = getFileUrlDirectory(import.meta.url);

async function bundleScene3DResourceResolverExport(name: string): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${name} } from './contract.ts';`,
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
    const output = await bundleScene3DResourceResolverExport('createScene3DResourceResolver');
    expect(output).not.toContain('StandardPbrMaterial');
    expect(output).not.toContain('UnlitMaterial');
    expect(output).not.toContain('image resource resolution failed');
  });

  it('includes built-in material listers only through the named assembly', async () => {
    const output = await bundleScene3DResourceResolverExport('createBuiltInScene3DResourceResolver');
    expect(output).toContain('StandardPbrMaterial');
    expect(output).toContain('UnlitMaterial');
  });

  it('includes failure logging only through the separately imported guard', async () => {
    const output = await bundleScene3DResourceResolverExport('enableScene3DResourceFailureGuards');
    expect(output).toContain('image resource resolution failed');
  });
});

function getFileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
