import { createMatrix } from '@flighthq/geometry/contract';
import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import { beginGlRenderPass, endGlRenderPass } from './glRenderPass';
import { getGlRenderStateRuntime } from './glRenderState';
import {
  createGlRenderTarget,
  declareGlRenderTargetColorSpace,
  destroyGlRenderTarget,
  drawGlRenderTargetResult,
  explainGlRenderTarget,
  isGlRenderTargetFormatSupported,
  resizeGlRenderTarget,
  resolveGlRenderTargetAxes,
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

  it('resets currentTextureRealization to null after creation', () => {
    const { state } = makeState();
    const runtime = getGlRenderStateRuntime(state);
    runtime.context.currentTextureRealization = { straightAlpha: false, texture: {} as WebGLTexture };
    createGlRenderTarget(state, { width: 32, height: 32 });
    expect(runtime.context.currentTextureRealization).toBeNull();
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

  it('retains canonical requested axes separately from effective storage', () => {
    const { state, gl } = makeState();
    vi.mocked(gl.getParameter).mockImplementation((parameter) => (parameter === gl.MAX_SAMPLES ? 4 : null));
    const target = createGlRenderTarget(state, {
      width: 32,
      height: 16,
      colorAttachments: 2,
      colorFormats: ['rgba8', 'rgba16f'],
      sampleCount: 8,
      depth: 'depth-stencil-sampled',
      colorSpace: 'linear',
    });

    expect(target.requestedAxes).toEqual({
      width: 32,
      height: 16,
      format: 'rgba8',
      colorAttachments: 2,
      colorFormats: ['rgba8', 'rgba16f'],
      sampleCount: 8,
      depth: 'depth-stencil-sampled',
      colorSpace: 'linear',
    });
    expect(target.sampleCount).toBe(4);
    expect(target.depth).toBe('depth-stencil');
  });

  it('falls back preferred float formats directly to rgba8 when EXT_color_buffer_float is unavailable', () => {
    const { state, gl } = makeState();
    // Simulate GL without float-render support (e.g. headless SwiftShader): a float target would be
    // framebuffer-incomplete and render black, so the effective format degrades to the renderable rgba8.
    (gl as unknown as { getExtension: (n: string) => unknown }).getExtension = (name: string) =>
      name === 'EXT_color_buffer_float' ? null : {};
    for (const format of ['rgba16f', 'rgba32f'] as const) {
      const target = createGlRenderTarget(state, { width: 32, height: 32, format }, 'preferred');
      expect(target.format).toBe('rgba8');
      expect(target.colorFormats).toEqual(['rgba8']);
    }
  });

  it('keeps a float format when EXT_color_buffer_float is available', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (n: string) => unknown }).getExtension = () => ({});
    const target = createGlRenderTarget(state, { width: 32, height: 32, format: 'rgba16f' });
    expect(target.format).toBe('rgba16f');
  });

  it('refuses a required unsupported float format before allocating storage', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (n: string) => unknown }).getExtension = (name: string) =>
      name === 'EXT_color_buffer_float' ? null : {};
    vi.clearAllMocks();

    const target = createGlRenderTarget(state, { width: 32, height: 32, format: 'rgba32f' }, 'required');

    expect(target).toBeNull();
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(gl.createTexture).not.toHaveBeenCalled();
  });

  it('refuses required heterogeneous storage when any attachment format is unsupported', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (n: string) => unknown }).getExtension = (name: string) =>
      name === 'EXT_color_buffer_float' ? null : {};

    const target = createGlRenderTarget(
      state,
      {
        width: 32,
        height: 32,
        colorAttachments: 2,
        colorFormats: ['rgba8', 'rgba16f'],
      },
      'required',
    );

    expect(target).toBeNull();
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
    expect(target.requestedAxes.colorSpace).toBe('linear');
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

describe('explainGlRenderTarget', () => {
  it('reports every GL capability substitution without losing the request', () => {
    const { state, gl } = makeState();
    vi.mocked(gl.getParameter).mockImplementation((parameter) => (parameter === gl.MAX_SAMPLES ? 4 : null));
    (gl as unknown as { getExtension: (name: string) => unknown }).getExtension = (name: string) =>
      name === 'EXT_color_buffer_float' ? null : {};
    const target = createGlRenderTarget(state, {
      width: 32,
      height: 16,
      format: 'rgba16f',
      sampleCount: 8,
      depth: 'depth-stencil-sampled',
    });

    expect(explainGlRenderTarget(target).differences).toEqual([
      { axis: 'format', effective: 'rgba8', requested: 'rgba16f' },
      { axis: 'colorFormats', effective: ['rgba8'], requested: ['rgba16f'] },
      { axis: 'sampleCount', effective: 4, requested: 8 },
      { axis: 'depth', effective: 'depth-stencil', requested: 'depth-stencil-sampled' },
    ]);
  });

  it('reports no differences when GL realizes every requested axis', () => {
    const { state } = makeState();
    const target = createGlRenderTarget(state, { width: 32, height: 16 });
    expect(explainGlRenderTarget(target).differences).toEqual([]);
  });
});

describe('isGlRenderTargetFormatSupported', () => {
  it('reports rgba8 independently of float extension support', () => {
    const { state, gl } = makeState();
    const getExtension = vi.fn(() => null);
    (gl as unknown as { getExtension: (name: string) => unknown }).getExtension = getExtension;

    expect(isGlRenderTargetFormatSupported(state, 'rgba8')).toBe(true);
    expect(getExtension).not.toHaveBeenCalled();
  });

  it('reports both float formats from EXT_color_buffer_float', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (name: string) => unknown }).getExtension = () => null;
    expect(isGlRenderTargetFormatSupported(state, 'rgba16f')).toBe(false);
    expect(isGlRenderTargetFormatSupported(state, 'rgba32f')).toBe(false);

    (gl as unknown as { getExtension: (name: string) => unknown }).getExtension = () => ({});
    expect(isGlRenderTargetFormatSupported(state, 'rgba16f')).toBe(true);
    expect(isGlRenderTargetFormatSupported(state, 'rgba32f')).toBe(true);
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

  it('restores the tracked framebuffer after reallocating storage', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 64 });
    const previous = { name: 'previous-framebuffer' } as unknown as WebGLFramebuffer;
    getGlRenderStateRuntime(state).currentFramebuffer = previous;
    vi.clearAllMocks();

    resizeGlRenderTarget(state, target, 128, 96);

    expect(vi.mocked(gl.bindFramebuffer)).toHaveBeenLastCalledWith(gl.FRAMEBUFFER, previous);
    expect(getGlRenderStateRuntime(state).currentFramebuffer).toBe(previous);
  });

  it('preserves heterogeneous color formats and sampled depth across resize', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (name: string) => unknown }).getExtension = () => ({});
    const target = createGlRenderTarget(state, {
      width: 64,
      height: 64,
      colorAttachments: 2,
      colorFormats: ['rgba8', 'rgba32f'],
      depth: 'depth-stencil-sampled',
    });
    vi.clearAllMocks();

    resizeGlRenderTarget(state, target, 128, 96);

    expect(target.colorAttachments).toBe(2);
    expect(target.colorFormats).toEqual(['rgba8', 'rgba32f']);
    expect(target.depth).toBe('depth-stencil-sampled');
    expect(target.depthTexture).not.toBeNull();
    expect(vi.mocked(gl.texImage2D).mock.calls.map((call) => call[2])).toEqual([
      gl.RGBA8,
      gl.RGBA32F,
      gl.DEPTH24_STENCIL8,
    ]);
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

  it('disables an active scissor for the storage-wide resolve and restores it afterward', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    target.sampleCount = 4;
    target.resolveFramebuffer = {} as WebGLFramebuffer;
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentScissorRect = { height: 12, width: 16, x: 3, y: 4 };
    const blit = vi.fn();
    Object.assign(gl as unknown as Record<string, unknown>, {
      READ_FRAMEBUFFER: 36008,
      DRAW_FRAMEBUFFER: 36009,
      COLOR_BUFFER_BIT: 16384,
      NEAREST: 9728,
      NONE: 0,
      blitFramebuffer: blit,
      readBuffer: vi.fn(),
      drawBuffers: vi.fn(),
      flush: vi.fn(),
    });

    resolveGlRenderTarget(state, target);

    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(vi.mocked(gl.disable).mock.invocationCallOrder.at(-1)).toBeLessThan(blit.mock.invocationCallOrder[0]);
    expect(gl.enable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(gl.scissor).toHaveBeenLastCalledWith(3, 4, 16, 12);
  });

  it('restores framebuffer and scissor state when an MSAA blit throws', () => {
    const { state, gl } = makeState();
    const target = createGlRenderTarget(state, { width: 64, height: 48 });
    target.sampleCount = 4;
    target.resolveFramebuffer = { id: 'resolve' } as unknown as WebGLFramebuffer;
    const runtime = getGlRenderStateRuntime(state);
    const enclosingFramebuffer = { id: 'outer' } as unknown as WebGLFramebuffer;
    runtime.currentFramebuffer = enclosingFramebuffer;
    runtime.currentScissorRect = { height: 12, width: 16, x: 3, y: 4 };
    Object.assign(gl as unknown as Record<string, unknown>, {
      READ_FRAMEBUFFER: 36008,
      DRAW_FRAMEBUFFER: 36009,
      COLOR_BUFFER_BIT: 16384,
      NEAREST: 9728,
      NONE: 0,
      blitFramebuffer: vi.fn(() => {
        throw new Error('blit failed');
      }),
      readBuffer: vi.fn(),
      drawBuffers: vi.fn(),
      flush: vi.fn(),
    });

    expect(() => resolveGlRenderTarget(state, target)).toThrow('blit failed');
    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.READ_FRAMEBUFFER, enclosingFramebuffer);
    expect(gl.bindFramebuffer).toHaveBeenLastCalledWith(gl.DRAW_FRAMEBUFFER, enclosingFramebuffer);
    expect(gl.enable).toHaveBeenLastCalledWith(gl.SCISSOR_TEST);
    expect(gl.scissor).toHaveBeenLastCalledWith(3, 4, 16, 12);
  });
});

describe('resolveGlRenderTargetAxes', () => {
  it('queries effective axes without allocating target storage', () => {
    const { state, gl } = makeState();
    vi.mocked(gl.getParameter).mockImplementation((parameter) => (parameter === gl.MAX_SAMPLES ? 2 : null));
    vi.clearAllMocks();

    const axes = resolveGlRenderTargetAxes(state, { width: 32, height: 16, sampleCount: 4 });

    expect(axes.sampleCount).toBe(2);
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(gl.createTexture).not.toHaveBeenCalled();
  });

  it('applies preferred fallback and required refusal without allocating storage', () => {
    const { state, gl } = makeState();
    (gl as unknown as { getExtension: (name: string) => unknown }).getExtension = () => null;
    vi.clearAllMocks();

    expect(resolveGlRenderTargetAxes(state, { width: 32, height: 16, format: 'rgba32f' }, 'preferred')).toMatchObject({
      format: 'rgba8',
      colorFormats: ['rgba8'],
    });
    expect(resolveGlRenderTargetAxes(state, { width: 32, height: 16, format: 'rgba32f' }, 'required')).toBeNull();
    expect(gl.createFramebuffer).not.toHaveBeenCalled();
    expect(gl.createTexture).not.toHaveBeenCalled();
  });
});
