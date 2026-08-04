// @vitest-environment node

import { build } from 'esbuild';

const resolveDir = getFileUrlDirectory(import.meta.url);

async function bundleLayoutExports(names: readonly string[]): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    stdin: {
      contents: `export { ${names.join(', ')} } from './contract.ts';`,
      resolveDir,
      sourcefile: `tree-shake-${names.join('-')}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

describe('layout resolver tree shaking', () => {
  it('keeps anchor-only assembly independent of flex and grid', async () => {
    const output = await bundleLayoutExports([
      'createLayoutState',
      'registerAnchorLayoutResolver',
      'resolveLayoutTree',
    ]);
    expect(output).toContain('AnchorLayout');
    expect(output).not.toContain('space-evenly');
    expect(output).not.toContain('columnGap');
  });

  it('includes each optional resolver only through its named registrar', async () => {
    const flex = await bundleLayoutExports(['registerFlexLayoutResolver']);
    const grid = await bundleLayoutExports(['registerGridLayoutResolver']);
    expect(flex).toContain('space-evenly');
    expect(flex).not.toContain('columnGap');
    expect(grid).toContain('columnGap');
    expect(grid).not.toContain('space-evenly');
  });
});

function getFileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
