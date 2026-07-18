import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import { getOrCreateRenderProxy2D } from '@flighthq/render';

import { beginGlRenderPass, endGlRenderPass } from './glRenderPass';
import { getGlRenderStateRuntime } from './glRenderState';
import {
  createGlRenderTarget,
  declareGlRenderTargetColorSpace,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
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

  it("defaults colorSpace to 'srgb' when the descriptor omits it", () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 32, height: 32 });
    expect(target.colorSpace).toBe('srgb');
  });

  it('honors an explicit colorSpace', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 32, height: 32, colorSpace: 'linear' });
    expect(target.colorSpace).toBe('linear');
  });

  it('falls back a float format to rgba8 when EXT_color_buffer_float is unavailable', () => {
    const { state, gl } = makeState();
    // Simulate GL without float-render support (e.g. headless SwiftShader): a float target would be
    // framebuffer-incomplete and render black, so the effective format degrades to the renderable rgba8.
    (gl as unknown as { getExtension: (n: string) => unknown }).getExtension = (name: string) =>
      name === 'EXT_color_buffer_float' ? null : {};
    const target = createGlRenderTarget(state, { width: 32, height: 32, format: 'rgba16f' });
    expect(target.format).toBe('rgba8');
  });

  it('keeps a float format when EXT_color_buffer_float is available', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (n: string) => unknown }).getExtension = () => ({});
    const target = createGlRenderTarget(state, { width: 32, height: 32, format: 'rgba16f' });
    expect(target.format).toBe('rgba16f');
  });
});

describe('declareGlRenderTargetColorSpace', () => {
  it('stamps the currently bound target and returns true', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    expect(target.colorSpace).toBe('srgb');
    beginGlRenderPass(state, target);
    expect(declareGlRenderTargetColorSpace(state, 'linear')).toBe(true);
    expect(target.colorSpace).toBe('linear');
    endGlRenderPass(state);
  });

  it('returns false when no target is bound (rendering to the canvas)', () => {
    const { state } = makeState();
    expect(declareGlRenderTargetColorSpace(state, 'linear')).toBe(false);
  });

  it('is restored to the outer target when a nested target ends', () => {
    const { state } = makeState();
    const outer = createGlRenderTarget(state, { width: 64, height: 48 });
    const inner = createGlRenderTarget(state, { width: 32, height: 32 });
    beginGlRenderPass(state, outer);
    beginGlRenderPass(state, inner);
    declareGlRenderTargetColorSpace(state, 'linear');
    expect(inner.colorSpace).toBe('linear');
    endGlRenderPass(state);
    // Back on `outer`: a declare now stamps it, not the popped inner target.
    declareGlRenderTargetColorSpace(state, 'linear');
    expect(outer.colorSpace).toBe('linear');
    endGlRenderPass(state);
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
