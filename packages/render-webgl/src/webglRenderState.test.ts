import { createWebGLRenderState, destroyWebGLRenderState } from './webglRenderState';
import { makeGL } from './webglTestHelper';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  const gl = makeGL();
  canvas.getContext = vi.fn().mockReturnValue(gl) as typeof canvas.getContext;
  return { canvas, gl };
}

describe('createWebGLRenderState', () => {
  it('throws when WebGL2 context is unavailable', () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = vi.fn().mockReturnValue(null) as typeof canvas.getContext;
    expect(() => createWebGLRenderState(canvas)).toThrow('Failed to get WebGL2 context.');
  });

  it('stores the canvas on the returned state', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    expect(state.canvas).toBe(canvas);
  });

  it('stores the GL context on the returned state', () => {
    const { canvas, gl } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    expect(state.gl).toBe(gl);
  });

  it('initializes currentBlendMode to null', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    expect(state.currentBlendMode).toBeNull();
  });

  it('initializes currentProgram to null', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    expect(state.currentProgram).toBeNull();
  });

  it('initializes currentTexture to null', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    expect(state.currentTexture).toBeNull();
  });

  it('enables blending during initialization', () => {
    const { canvas, gl } = makeCanvas();
    createWebGLRenderState(canvas);
    expect(gl.enable).toHaveBeenCalledWith((gl as unknown as { BLEND: number }).BLEND);
  });

  it('disables depth testing during initialization', () => {
    const { canvas, gl } = makeCanvas();
    createWebGLRenderState(canvas);
    expect(gl.disable).toHaveBeenCalledWith((gl as unknown as { DEPTH_TEST: number }).DEPTH_TEST);
  });

  it('sets the default premultiplied-alpha blend function', () => {
    const { canvas, gl } = makeCanvas();
    createWebGLRenderState(canvas);
    const g = gl as unknown as { ONE: number; ONE_MINUS_SRC_ALPHA: number };
    expect(gl.blendFunc).toHaveBeenCalledWith(g.ONE, g.ONE_MINUS_SRC_ALPHA);
  });

  it('applies the backgroundColor option', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas, { backgroundColor: 0xff0000ff });
    expect(state.backgroundColor).toBe(0xff0000ff);
  });

  it('uses the provided pixelRatio option', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas, { pixelRatio: 2 });
    expect(state.pixelRatio).toBe(2);
  });

  it('defaults roundPixels to false', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    expect(state.roundPixels).toBe(false);
  });

  it('applies the roundPixels option', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas, { roundPixels: true });
    expect(state.roundPixels).toBe(true);
  });
});

describe('destroyWebGLRenderState', () => {
  it('deletes the state-owned shader programs and buffers', () => {
    const { canvas, gl } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    const deleteProgram = vi.spyOn(gl, 'deleteProgram');
    const deleteBuffer = vi.spyOn(gl, 'deleteBuffer');

    destroyWebGLRenderState(state);

    expect(deleteProgram).toHaveBeenCalled();
    expect(deleteBuffer).toHaveBeenCalled();
  });

  it('is safe to call twice (WebGL deletes are no-ops on already-deleted resources)', () => {
    const { canvas } = makeCanvas();
    const state = createWebGLRenderState(canvas);
    destroyWebGLRenderState(state);
    expect(() => destroyWebGLRenderState(state)).not.toThrow();
  });
});
