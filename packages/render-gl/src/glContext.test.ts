import { build } from 'esbuild';

describe('createGlRenderState tree-shaking', () => {
  it('tree-shakes canvas context acquisition out of a context-first state bundle', async () => {
    const renderStateBundle = await bundleRenderGlExport('createGlRenderState');
    expect(renderStateBundle).not.toContain('Failed to get WebGL2 context.');
    expect(renderStateBundle).not.toMatch(/\.getContext\(["']webgl2["']/);
  });
});

async function bundleRenderGlExport(name: 'createGlRenderState'): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    packages: 'external',
    platform: 'browser',
    stdin: {
      contents: `export { ${name} } from './index.ts';`,
      resolveDir: getFileUrlDirectory(import.meta.url),
      sourcefile: `tree-shake-${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0]!.text;
}

function getFileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z0-9]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
