import { createWebGlContext } from './webGlContext';

function makeGL(): WebGL2RenderingContext {
  return document.createElement('canvas').getContext('webgl2')!;
}

function makeCanvas(context: WebGL2RenderingContext | null = makeGL()): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn().mockReturnValue(context) as typeof canvas.getContext;
  return canvas;
}

describe('createWebGlContext', () => {
  it('returns the canvas WebGL2 context', () => {
    const gl = makeGL();
    expect(createWebGlContext(makeCanvas(gl))).toBe(gl);
  });

  it('requests the context defaults independently from render options', () => {
    const canvas = makeCanvas();
    createWebGlContext(canvas);
    expect(canvas.getContext).toHaveBeenCalledWith('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'default',
      stencil: true,
    });
  });

  it('applies context options and lets explicit attributes override their convenience fields', () => {
    const canvas = makeCanvas();
    createWebGlContext(canvas, {
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
    expect(() => createWebGlContext(makeCanvas(null))).toThrow('Failed to get WebGL2 context.');
  });
});
