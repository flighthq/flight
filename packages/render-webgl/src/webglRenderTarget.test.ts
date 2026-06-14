import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';

import type { WebGLRenderStateInternal } from './internal';
import {
  beginWebGLRenderTarget,
  createWebGLRenderTarget,
  destroyWebGLRenderTarget,
  drawWebGLRenderTargetResult,
  endWebGLRenderTarget,
  resizeWebGLRenderTarget,
} from './webglRenderTarget';
import { makeWebGLState } from './webglTestHelper';

function makeState() {
  const { state: _state, gl: _gl } = makeWebGLState();

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

  const state = _state as WebGLRenderStateInternal;
  state.currentFramebuffer = null;
  state.renderTargetViewport = null;

  return { state, gl };
}

describe('beginWebGLRenderTarget', () => {
  it('binds the target framebuffer', () => {
    const { state, gl } = makeState();
    const target = createWebGLRenderTarget(state, 64, 48);
    vi.clearAllMocks();

    beginWebGLRenderTarget(state, target, createMatrix());

    expect(vi.mocked(gl.bindFramebuffer)).toHaveBeenCalledWith(
      (gl as unknown as { FRAMEBUFFER: number }).FRAMEBUFFER,
      target.framebuffer,
    );
  });

  it('sets renderTargetViewport to the target dimensions', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 64, 48);

    beginWebGLRenderTarget(state, target, createMatrix());

    expect(state.renderTargetViewport).toEqual({ width: 64, height: 48 });
  });

  it('sets renderTransform2D to the provided transform', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 64, 48);
    const renderTransform = createMatrix();
    renderTransform.tx = 10;
    renderTransform.ty = 20;

    beginWebGLRenderTarget(state, target, renderTransform);

    expect(state.renderTransform2D!.tx).toBe(10);
    expect(state.renderTransform2D!.ty).toBe(20);
  });

  it('supports nested begin calls', () => {
    const { state } = makeState();
    const targetA = createWebGLRenderTarget(state, 64, 48);
    const targetB = createWebGLRenderTarget(state, 32, 32);

    beginWebGLRenderTarget(state, targetA, createMatrix());
    beginWebGLRenderTarget(state, targetB, createMatrix());

    expect(state.renderTargetViewport).toEqual({ width: 32, height: 32 });

    endWebGLRenderTarget(state);
    expect(state.renderTargetViewport).toEqual({ width: 64, height: 48 });
  });
});

describe('createWebGLRenderTarget', () => {
  it('returns a render target with the requested dimensions', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 128, 64);
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });

  it('enforces a minimum size of 1', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 0, 0);
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('ceils fractional dimensions', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 10.3, 20.9);
    expect(target.width).toBe(11);
    expect(target.height).toBe(21);
  });

  it('calls createFramebuffer and createTexture', () => {
    const { state, gl } = makeState();
    createWebGLRenderTarget(state, 64, 64);
    expect(vi.mocked(gl.createFramebuffer)).toHaveBeenCalled();
    expect(vi.mocked(gl.createTexture)).toHaveBeenCalled();
  });

  it('resets currentTexture to null after creation', () => {
    const { state } = makeState();
    state.currentTexture = {} as WebGLTexture;
    createWebGLRenderTarget(state, 32, 32);
    expect(state.currentTexture).toBeNull();
  });
});

describe('destroyWebGLRenderTarget', () => {
  it('deletes the framebuffer and texture', () => {
    const { state, gl } = makeState();
    const target = createWebGLRenderTarget(state, 32, 32);
    const { framebuffer, texture } = target;

    destroyWebGLRenderTarget(state, target);

    expect(vi.mocked(gl.deleteFramebuffer)).toHaveBeenCalledWith(framebuffer);
    expect(vi.mocked(gl.deleteTexture)).toHaveBeenCalledWith(texture);
  });
});

describe('drawWebGLRenderTargetResult', () => {
  it('is a no-op when target dimensions are zero', () => {
    const { state, gl } = makeState();
    const node = getOrCreateDisplayObjectRenderNode(state, createDisplayObject());
    const target = createWebGLRenderTarget(state, 1, 1);
    target.width = 0;
    vi.clearAllMocks();

    drawWebGLRenderTargetResult(state, node, target, createMatrix());

    expect(vi.mocked(gl.bindTexture)).not.toHaveBeenCalled();
  });

  it('composites a valid target without throwing', () => {
    const { state } = makeState();
    const node = getOrCreateDisplayObjectRenderNode(state, createDisplayObject());
    node.alpha = 1;
    const target = createWebGLRenderTarget(state, 64, 48);

    expect(() => drawWebGLRenderTargetResult(state, node, target, createMatrix())).not.toThrow();
  });

  it('binds the target texture', () => {
    const { state, gl } = makeState();
    const node = getOrCreateDisplayObjectRenderNode(state, createDisplayObject());
    const target = createWebGLRenderTarget(state, 64, 48);
    vi.clearAllMocks();

    drawWebGLRenderTargetResult(state, node, target, createMatrix());

    expect(vi.mocked(gl.bindTexture)).toHaveBeenCalledWith(
      (gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D,
      target.texture,
    );
  });
});

describe('endWebGLRenderTarget', () => {
  it('restores the previous framebuffer', () => {
    const { state, gl } = makeState();
    const target = createWebGLRenderTarget(state, 64, 48);

    beginWebGLRenderTarget(state, target, createMatrix());
    vi.clearAllMocks();
    endWebGLRenderTarget(state);

    expect(vi.mocked(gl.bindFramebuffer)).toHaveBeenCalledWith(
      (gl as unknown as { FRAMEBUFFER: number }).FRAMEBUFFER,
      null,
    );
  });

  it('restores renderTargetViewport to null', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 64, 48);

    beginWebGLRenderTarget(state, target, createMatrix());
    endWebGLRenderTarget(state);

    expect(state.renderTargetViewport).toBeNull();
  });

  it('restores the original renderTransform2D', () => {
    const { state } = makeState();
    const originalTransform = state.renderTransform2D;
    const target = createWebGLRenderTarget(state, 64, 48);
    const renderTransform = createMatrix();
    renderTransform.tx = 99;

    beginWebGLRenderTarget(state, target, renderTransform);
    endWebGLRenderTarget(state);

    expect(state.renderTransform2D).toBe(originalTransform);
  });

  it('without a matching begin is a no-op', () => {
    const { state, gl } = makeState();
    expect(() => endWebGLRenderTarget(state)).not.toThrow();
    expect(vi.mocked(gl.bindFramebuffer)).not.toHaveBeenCalled();
  });
});

describe('resizeWebGLRenderTarget', () => {
  it('updates the target dimensions', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 64, 64);

    resizeWebGLRenderTarget(state, target, 256, 128);

    expect(target.width).toBe(256);
    expect(target.height).toBe(128);
  });

  it('enforces a minimum size of 1', () => {
    const { state } = makeState();
    const target = createWebGLRenderTarget(state, 64, 64);

    resizeWebGLRenderTarget(state, target, 0, 0);

    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('reallocates the texture storage', () => {
    const { state, gl } = makeState();
    const target = createWebGLRenderTarget(state, 64, 64);
    vi.clearAllMocks();

    resizeWebGLRenderTarget(state, target, 128, 128);

    expect(vi.mocked(gl.bindTexture)).toHaveBeenCalledWith(
      (gl as unknown as { TEXTURE_2D: number }).TEXTURE_2D,
      target.texture,
    );
    expect(vi.mocked(gl.texImage2D)).toHaveBeenCalled();
  });
});
