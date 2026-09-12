import type { GlRenderPass, GlRenderTarget } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  beginGlCubeRenderFace,
  createGlCubeRenderTarget,
  destroyGlCubeRenderTarget,
  endGlCubeRenderFace,
  initializeGlCubeRenderTarget,
} from './glCubeRenderTarget';
import { getGlRenderStateRuntime } from './glRenderState';
import { declareGlRenderTargetColorSpace } from './glRenderTarget';
import { createGlState } from './glTestHelper';

function makeState() {
  const { state, gl: base } = createGlState({ backgroundColorRgba: [0.25, 0.5, 0.75, 1] });
  const framebuffer = { name: 'cube-framebuffer' } as WebGLFramebuffer;
  const texture = { name: 'cube-texture' } as WebGLTexture;
  const renderbuffer = { name: 'cube-depth' } as WebGLRenderbuffer;
  const previousFramebuffer = { name: 'previous-framebuffer' } as WebGLFramebuffer;
  const previousRenderbuffer = { name: 'previous-renderbuffer' } as WebGLRenderbuffer;
  const previousCubeTexture = { name: 'previous-cube' } as WebGLTexture;
  const gl = Object.assign(base as unknown as Record<string, unknown>, {
    ACTIVE_TEXTURE: 0x84e0,
    COLOR: 0x1800,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH24_STENCIL8: 0x88f0,
    DEPTH_STENCIL: 0x84f9,
    DEPTH_STENCIL_ATTACHMENT: 0x821a,
    DEPTH_WRITEMASK: 0x0b72,
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
    HALF_FLOAT: 0x140b,
    RENDERBUFFER: 0x8d41,
    RENDERBUFFER_BINDING: 0x8ca7,
    RGBA: 0x1908,
    RGBA16F: 0x881a,
    SCISSOR_BOX: 0x0c10,
    SCISSOR_TEST: 0x0c11,
    STENCIL_TEST: 0x0b90,
    TEXTURE_BINDING_CUBE_MAP: 0x8514,
    TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_R: 0x8072,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    VIEWPORT: 0x0ba2,
    bindFramebuffer: vi.fn(),
    bindRenderbuffer: vi.fn(),
    bindTexture: vi.fn(),
    clearBufferfi: vi.fn(),
    clearBufferfv: vi.fn(),
    createFramebuffer: vi.fn(() => framebuffer),
    createRenderbuffer: vi.fn(() => renderbuffer),
    createTexture: vi.fn(() => texture),
    deleteFramebuffer: vi.fn(),
    deleteRenderbuffer: vi.fn(),
    deleteTexture: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    getExtension: vi.fn(() => ({})),
    getParameter: vi.fn((parameter: number) => {
      if (parameter === 0x8ca6) return previousFramebuffer;
      if (parameter === 0x8ca7) return previousRenderbuffer;
      if (parameter === 0x8514) return previousCubeTexture;
      if (parameter === 0x0ba2) return new Int32Array([3, 4, 50, 60]);
      if (parameter === 0x0c10) return new Int32Array([5, 6, 40, 30]);
      if (parameter === 0x0b72) return false;
      return null;
    }),
    isEnabled: vi.fn((capability: number) => capability === 0x0c11),
    renderbufferStorage: vi.fn(),
    scissor: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    viewport: vi.fn(),
  }) as unknown as WebGL2RenderingContext;
  return {
    framebuffer,
    gl,
    previousCubeTexture,
    previousFramebuffer,
    previousRenderbuffer,
    renderbuffer,
    state,
    texture,
  };
}

describe('beginGlCubeRenderFace', () => {
  it('binds and clears the selected face', () => {
    const { state, gl, framebuffer, texture } = makeState();
    const target = createGlCubeRenderTarget(state, 32);
    vi.clearAllMocks();

    const pass = beginGlCubeRenderFace(state, target, 4);
    expect(declareGlRenderTargetColorSpace(state, 'srgb')).toBe(true);

    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, framebuffer);
    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + 4,
      texture,
      0,
    );
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(gl.clearBufferfv).toHaveBeenCalledWith(gl.COLOR, 0, new Float32Array([0.25, 0.5, 0.75, 1]));
    expect(gl.clearBufferfi).toHaveBeenCalledWith(gl.DEPTH_STENCIL, 0, 1, 0);
    expect(target.colorSpace).toBe('srgb');
    endGlCubeRenderFace(pass);
  });

  it('rejects a face outside the six-face cube range', () => {
    const { state } = makeState();
    const target = createGlCubeRenderTarget(state, 32);
    expect(() => beginGlCubeRenderFace(state, target, 6)).toThrow(RangeError);
  });
});

describe('createGlCubeRenderTarget', () => {
  it('allocates six RGBA16F faces and a default depth attachment', () => {
    const { state, gl, framebuffer, renderbuffer, texture } = makeState();
    const target = createGlCubeRenderTarget(state, 31.2);

    expect(target.size).toBe(32);
    expect(target.width).toBe(32);
    expect(target.height).toBe(32);
    expect(target.colorSpace).toBe('linear');
    expect(target.framebuffer).toBe(framebuffer);
    expect(target.texture).toBe(texture);
    expect(target.textures).toEqual([texture]);
    expect(target.depthStencilRenderbuffer).toBe(renderbuffer);
    expect(Object.hasOwn(target, EntityRuntimeKey)).toBe(true);
    expect(vi.mocked(gl.texImage2D).mock.calls).toEqual(
      Array.from({ length: 6 }, (_, face) => [
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        0,
        gl.RGBA16F,
        32,
        32,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
        null,
      ]),
    );
    expect(gl.renderbufferStorage).toHaveBeenCalledWith(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, 32, 32);
  });

  it('can omit depth and restores creation-time bindings', () => {
    const { state, gl, previousCubeTexture, previousFramebuffer, previousRenderbuffer } = makeState();
    const target = createGlCubeRenderTarget(state, 0, { depth: false });

    expect(target.size).toBe(1);
    expect(target.depthStencilRenderbuffer).toBeNull();
    expect(gl.createRenderbuffer).not.toHaveBeenCalled();
    expect(vi.mocked(gl.bindFramebuffer).mock.lastCall).toEqual([gl.FRAMEBUFFER, previousFramebuffer]);
    expect(vi.mocked(gl.bindRenderbuffer).mock.lastCall).toEqual([gl.RENDERBUFFER, previousRenderbuffer]);
    expect(vi.mocked(gl.bindTexture).mock.lastCall).toEqual([gl.TEXTURE_CUBE_MAP, previousCubeTexture]);
  });
});

describe('destroyGlCubeRenderTarget', () => {
  it('deletes every owned GPU resource', () => {
    const { state, gl, framebuffer, renderbuffer, texture } = makeState();
    const target = createGlCubeRenderTarget(state, 16);
    vi.clearAllMocks();

    destroyGlCubeRenderTarget(state, target);

    expect(gl.deleteFramebuffer).toHaveBeenCalledWith(framebuffer);
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(gl.deleteRenderbuffer).toHaveBeenCalledWith(renderbuffer);
  });
});

describe('endGlCubeRenderFace', () => {
  it('restores physical and tracked framebuffer and viewport state', () => {
    const { state, gl, previousFramebuffer } = makeState();
    const target = createGlCubeRenderTarget(state, 32);
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentFramebuffer = previousFramebuffer;
    runtime.renderTargetViewport = { height: 60, width: 50, x: 3, y: 4 };
    vi.clearAllMocks();

    const pass = beginGlCubeRenderFace(state, target, 0);
    expect(runtime.currentRenderTarget).toBe(target);
    endGlCubeRenderFace(pass);

    expect(vi.mocked(gl.bindFramebuffer).mock.lastCall).toEqual([gl.FRAMEBUFFER, previousFramebuffer]);
    expect(vi.mocked(gl.viewport).mock.lastCall).toEqual([3, 4, 50, 60]);
    expect(runtime.currentFramebuffer).toBe(previousFramebuffer);
    expect(runtime.currentRenderTarget).toBeNull();
    expect(runtime.renderTargetViewport).toEqual({ height: 60, width: 50, x: 3, y: 4 });
    expect(vi.mocked(gl.depthMask).mock.lastCall).toEqual([false]);
  });

  it('rejects an unmatched end', () => {
    const { state } = makeState();
    const mockPass = { gl: state.gl, state, target: {} as GlRenderTarget } as GlRenderPass;
    expect(() => endGlCubeRenderFace(mockPass)).toThrow('without a matching beginGlCubeRenderFace');
  });
});

describe('initializeGlCubeRenderTarget', () => {
  it('is the construction initializer used by createGlCubeRenderTarget', () => {
    expect(typeof initializeGlCubeRenderTarget).toBe('function');
  });
});
