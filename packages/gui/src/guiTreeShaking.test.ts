// @vitest-environment node

import { build } from 'esbuild';

describe('GUI controller tree shaking', () => {
  it('does not pull the catalog or tween runtime into a Button-only bundle', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      minify: true,
      packages: 'external',
      stdin: {
        contents: `export { createButtonController } from './contract.ts';`,
        resolveDir: fileUrlDirectory(import.meta.url),
        sourcefile: 'tree-shake-button.ts',
      },
      treeShaking: true,
      write: false,
    });
    const output = result.outputFiles[0].text;
    expect(output).toContain('createButtonController');
    expect(output).not.toContain('setInterval');
    expect(output).not.toContain('onExpandChange');
    expect(output).not.toContain('createTextInputManager');
    expect(output).not.toContain('@flighthq/tween');
  });

  it('does not pull later application GUI systems or tween into a GuiDialog-only bundle', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      minify: true,
      packages: 'external',
      stdin: {
        contents: `export { createGuiDialog } from './contract.ts';`,
        resolveDir: fileUrlDirectory(import.meta.url),
        sourcefile: 'tree-shake-gui-dialog.ts',
      },
      treeShaking: true,
      write: false,
    });
    const output = result.outputFiles[0].text;
    expect(output).toContain('createGuiDialog');
    expect(output).not.toContain('@flighthq/command');
    expect(output).not.toContain('@flighthq/dialog');
    expect(output).not.toContain('@flighthq/layout');
    expect(output).not.toContain('@flighthq/menu');
    expect(output).not.toContain('@flighthq/tween');
    expect(output).not.toContain('createTextInputManager');
    expect(output).not.toContain('onExpandChange');
  });
});

function fileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
