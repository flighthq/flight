import { build } from 'esbuild';

import { createGlContext } from './glContext';
import { makeGL } from './glTestHelper';

function makeCanvas(context: WebGL2RenderingContext | null = makeGL()): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn().mockReturnValue(context) as typeof canvas.getContext;
  return canvas;
}

describe('createGlContext', () => {
  it('returns the canvas WebGL2 context', () => {
    const gl = makeGL();
    expect(createGlContext(makeCanvas(gl))).toBe(gl);
  });

  it('requests the context defaults independently from render options', () => {
    const canvas = makeCanvas();
    createGlContext(canvas);
    expect(canvas.getContext).toHaveBeenCalledWith('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'default',
      stencil: true,
    });
  });

  it('applies context options and lets explicit attributes override their convenience fields', () => {
    const canvas = makeCanvas();
    createGlContext(canvas, {
      antialias: false,
      contextAttributes: { alpha: false, antialias: true, preserveDrawingBuffer: true },
      powerPreference: 'high-performance',
    });
    expect(canvas.getContext).toHaveBeenCalledWith('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      stencil: true,
    });
  });

  it('throws when the canvas has no WebGL2 context', () => {
    expect(() => createGlContext(makeCanvas(null))).toThrow('Failed to get WebGL2 context.');
  });

  it('tree-shakes canvas context acquisition out of a context-first state bundle', async () => {
    const renderStateBundle = await bundleRenderGlExport('createGlRenderState');
    expect(renderStateBundle).not.toContain('Failed to get WebGL2 context.');
    expect(renderStateBundle).not.toMatch(/\.getContext\(["']webgl2["']/);

    const contextBundle = await bundleRenderGlExport('createGlContext');
    expect(contextBundle).toContain('Failed to get WebGL2 context.');
    expect(contextBundle).toMatch(/\.getContext\(["']webgl2["']/);
  });
});

async function bundleRenderGlExport(name: 'createGlContext' | 'createGlRenderState'): Promise<string> {
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
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}
