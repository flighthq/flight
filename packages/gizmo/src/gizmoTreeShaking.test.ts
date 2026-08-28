// @vitest-environment node

import { build } from 'esbuild';

describe('Gizmo feature tree shaking', () => {
  it('does not pull the handle assembly or interaction runtime into a Node2D-feature-only bundle', async () => {
    const result = await build({
      bundle: true,
      format: 'esm',
      logLevel: 'silent',
      minify: true,
      packages: 'external',
      stdin: {
        contents: `export { createNode2DGizmoFeatures } from './contract.ts';`,
        resolveDir: fileUrlDirectory(import.meta.url),
        sourcefile: 'tree-shake-node2d-features.ts',
      },
      treeShaking: true,
      write: false,
    });
    const output = result.outputFiles[0].text;
    expect(output).toContain('createNode2DGizmoFeatures');
    expect(output).not.toContain('GizmoTranslateXHandle');
    expect(output).not.toContain('appendShapeCircle');
    expect(output).not.toContain('@flighthq/interaction');
    expect(output).not.toContain('@flighthq/selection');
  });
});

function fileUrlDirectory(url: string): string {
  const directory = new URL('.', url);
  const pathname = decodeURIComponent(directory.pathname);
  if (directory.hostname !== '') return `//${directory.hostname}${pathname}`;
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
