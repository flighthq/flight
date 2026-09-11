// @vitest-environment node

import { build } from 'esbuild';

describe('Electron Host tree shaking', () => {
  it('keeps a direct App leaf independent of sibling and full-host assembly', async () => {
    const output = await bundleElectronHostExport('electronHostAppName');
    expect(output).toContain('electronHostAppName');
    expect(output).toContain('getName');
    expect(output).not.toContain('getLocale');
    expect(output).not.toContain('requestSingleInstanceLock');
    expect(output).not.toContain('availableFormats');
  });

  it('keeps the Clipboard text leaf independent of sibling clipboard providers', async () => {
    const output = await bundleElectronHostExport('electronHostClipboardText');
    expect(output).toContain('electronHostClipboardText');
    expect(output).toContain('readText');
    expect(output).toContain('writeText');
    expect(output).not.toContain('availableFormats');
    expect(output).not.toContain('nativeImage');
    expect(output).not.toContain('readBookmark');
    expect(output).not.toContain('readRTF');
  });
});

async function bundleElectronHostExport(name: string): Promise<string> {
  const result = await build({
    bundle: true,
    format: 'esm',
    logLevel: 'silent',
    minify: true,
    packages: 'external',
    platform: 'node',
    stdin: {
      contents: `export { ${name} } from './index.ts';`,
      resolveDir: fileUrlDirectory(import.meta.url),
      sourcefile: `tree-shake-${name}.ts`,
    },
    treeShaking: true,
    write: false,
  });
  return result.outputFiles[0].text;
}

function fileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
