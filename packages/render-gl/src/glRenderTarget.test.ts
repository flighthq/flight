import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { getOrCreateRenderProxy2D } from '@flighthq/render';

import { getGlRenderStateRuntime } from './glRenderState';
import {
  beginGlRenderTarget,
  createGlRenderTarget,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  endGlRenderTarget,
  resizeGlRenderTarget,
  resolveGlRenderTarget,
} from './glRenderTarget';
import { createGlState } from './glTestHelper';

function makeState() {
  const { state: _state, gl: _gl } = createGlState();

  const mockFramebuffer = {} as WebGLFramebuffer;
  const mockTexture = {} as WebGLTexture;

  const gl = Object.assign(_gl as unknown as Record<string, unknown>, {
    FRAMEBUFFER: 36160,
    COLOR_ATTACHMENT0: 36064,
    createFramebuffer: vi.fn(() => mockFramebuffer),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteTexture: vi.fn(),
    createTexture: vi.fn(() => mockTexture),
  }) as unknown as WebGL2RenderingContext;

  const state = _state;
  const runtime = getGlRenderStateRuntime(state);
  runtime.currentFramebuffer = null;
  runtime.renderTargetViewport = null;

  return { state, gl };
}

describe('beginGlRenderTarget', () => {
  it('binds the target framebuffer', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    vi.clearAllMocks();

    beginGlRenderTarget(state, target, createMatrix());

    expect(vi.mocked(gl.bindFramebuffer)).toHaveBeenCalledWith(
      (gl as unknown as { FRAMEBUFFER: number }).FRAMEBUFFER,
      target.framebuffer,
    );
  });

  it('sets renderTargetViewport to the target dimensions', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });

    beginGlRenderTarget(state, target, createMatrix());

    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({ width: 64, height: 48 });
  });

  it('sets renderTransform2D to the provided transform', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    const renderTransform = createMatrix();
    renderTransform.tx = 10;
    renderTransform.ty = 20;

    beginGlRenderTarget(state, target, renderTransform);

    expect(state.renderTransform2D!.tx).toBe(10);
    expect(state.renderTransform2D!.ty).toBe(20);
  });

  it('supports nested begin calls', () => {
    const { state } = makeState();
    const targetA = createGlRenderTarget(state, { width: 64, height: 48 });
    const targetB = createGlRenderTarget(state, { width: 32, height: 32 });

    beginGlRenderTarget(state, targetA, createMatrix());
    beginGlRenderTarget(state, targetB, createMatrix());

    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({ width: 32, height: 32 });

    endGlRenderTarget(state);
    expect(getGlRenderStateRuntime(state).renderTargetViewport).toEqual({ width: 64, height: 48 });
  });
});

describe('createGlRenderTarget', () => {
  it('returns a render target with the requested dimensions', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 128, height: 64 });
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });

  it('enforces a minimum size of 1', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 0, height: 0 });
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('ceils fractional dimensions', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 10.3, height: 20.9 });
    expect(target.width).toBe(11);
    expect(target.height).toBe(21);
  });

  it('calls createFramebuffer and createTexture', () => {
    const { state, gl } = makeState();
    createGlRenderTarget(state, { width: 64, height: 64 });
    expect(vi.mocked(gl.createFramebuffer)).toHaveBeenCalled();
    expect(vi.mocked(gl.createTexture)).toHaveBeenCalled();
  });

  it('resets currentTexture to null after creation', () => {
    const { state } = makeState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentTexture = {} as WebGLTexture;
    createGlRenderTarget(state, { width: 32, height: 32 });
    expect(runtime.currentTexture).toBeNull();
  });
});

describe('destroyGlRenderTarget', () => {
  it('deletes the framebuffer and texture', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 32, height: 32 });
    const { framebuffer, texture } = target;

    destroyGlRenderTarget(state, target);

    expect(vi.mocked(gl.deleteFramebuffer)).toHaveBeenCalledWith(framebuffer);
    expect(vi.mocked(gl.deleteTexture)).toHaveBeenCalledWith(texture);
  });
});

describe('drawGlRenderTargetResult', () => {
  it('is a no-op when target dimensions are zero', () => {
    const { state, gl } = makeState();
    const node = getOrCreateRenderProxy2D(state, createDisplayObject());
    const target = createGlRenderTarget(state, { width: 1, height: 1 });
    target.width = 0;
    vi.clearAllMocks();

    drawGlRenderTargetResult(state, node, target, createMatrix());

    expect(vi.mocked(gl.bindTexture)).not.toHaveBeenCalled();
  });

  it('composites a valid target without throwing', () => {
    const { state } = makeState();
    const node = getOrCreateRenderProxy2D(state, createDisplayObject());
    node.alpha = 1;
    const target = createGlRenderTarget(state, { width: 64, height: 48 });

    expect(() => drawGlRenderTargetResult(state, node, target, createMatrix())).not.toThrow();
  });

  it('binds the target texture', () => {
    const { state, gl } = makeState();
    const node = getOrCreateRenderProxy2D(state, createDisplayObject());
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    vi.clearAllMocks();

    drawGlRenderTargetResult(state, node, target, createMatrix());

    expect(vi.mocked(gl.bindTexture)).toHaveBeenCalledWith(
      (gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D,
      target.texture,
    );
  });
});

describe('endGlRenderTarget', () => {
  it('restores the previous framebuffer', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });

    beginGlRenderTarget(state, target, createMatrix());
    vi.clearAllMocks();
    endGlRenderTarget(state);

    expect(vi.mocked(gl.bindFramebuffer)).toHaveBeenCalledWith(
      (gl as unknown as { FRAMEBUFFER: number }).FRAMEBUFFER,
      null,
    );
  });

  it('restores renderTargetViewport to null', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });

    beginGlRenderTarget(state, target, createMatrix());
    endGlRenderTarget(state);

    expect(getGlRenderStateRuntime(state).renderTargetViewport).toBeNull();
  });

  it('restores the original renderTransform2D', () => {
    const { state } = makeState();
    const originalTransform = state.renderTransform2D;
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    const renderTransform = createMatrix();
    renderTransform.tx = 99;

    beginGlRenderTarget(state, target, renderTransform);
    endGlRenderTarget(state);

    expect(state.renderTransform2D).toBe(originalTransform);
  });

  it('without a matching begin is a no-op', () => {
    const { state, gl } = makeState();
    expect(() => endGlRenderTarget(state)).not.toThrow();
    expect(vi.mocked(gl.bindFramebuffer)).not.toHaveBeenCalled();
  });
});

describe('resizeGlRenderTarget', () => {
  it('updates the target dimensions', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 64 });

    resizeGlRenderTarget(state, target, 256, 128);

    expect(target.width).toBe(256);
    expect(target.height).toBe(128);
  });

  it('enforces a minimum size of 1', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 64 });

    resizeGlRenderTarget(state, target, 0, 0);

    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('reallocates the texture storage', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 64 });
    vi.clearAllMocks();

    resizeGlRenderTarget(state, target, 128, 128);

    expect(vi.mocked(gl.bindTexture)).toHaveBeenCalledWith(
      (gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D,
      target.texture,
    );
    expect(vi.mocked(gl.texImage2D)).toHaveBeenCalled();
  });
});

describe('resolveGlRenderTarget', () => {
  it('is a no-op for a single-sample target', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    expect(target.sampleCount).toBe(1);
    vi.clearAllMocks();

    resolveGlRenderTarget(state, target);

    expect(vi.mocked(gl.bindFramebuffer)).not.toHaveBeenCalled();
  });

  it('is a no-op when the target has no resolve framebuffer', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    // Force the MSAA sample-count gate open but leave resolveFramebuffer null.
    target.sampleCount = 4;
    target.resolveFramebuffer = null;
    vi.clearAllMocks();

    resolveGlRenderTarget(state, target);

    expect(vi.mocked(gl.bindFramebuffer)).not.toHaveBeenCalled();
  });

  it('blits each color attachment and flushes for an MSAA target', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    target.sampleCount = 4;
    target.resolveFramebuffer = {} as WebGLFramebuffer;
    // Two color attachments resolve as two separate blits.
    target.textures = [{} as WebGLTexture, {} as WebGLTexture];

    const blit = vi.fn();
    const readBuffer = vi.fn();
    const drawBuffers = vi.fn();
    const flush = vi.fn();
    Object.assign(gl as unknown as Record<string, unknown>, {
      READ_FRAMEBUFFER: 36008,
      DRAW_FRAMEBUFFER: 36009,
      COLOR_BUFFER_BIT: 16384,
      NEAREST: 9728,
      NONE: 0,
      blitFramebuffer: blit,
      readBuffer,
      drawBuffers,
      flush,
    });

    resolveGlRenderTarget(state, target);

    expect(blit).toHaveBeenCalledTimes(2);
    expect(readBuffer).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
