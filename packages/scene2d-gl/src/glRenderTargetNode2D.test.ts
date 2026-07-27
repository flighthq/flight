import type * as GlRenderGlModule from '@flighthq/render-gl/contract';
import { createRenderCache, createRenderState } from '@flighthq/render/contract';
import { createDisplayObject, createRenderTargetNode2D } from '@flighthq/scene2d/contract';
import type {
  GlRenderState,
  GlRenderStateRuntime,
  GlRenderTarget,
  RenderProxy2D,
  RenderTargetNode2D,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, RenderTargetNode2DKind } from '@flighthq/types/contract';

import type * as GlCacheModule from './glCache';
import type * as GlRenderTargetNode2DModule from './glRenderTargetNode2D';
import type * as GlSpriteBatchModule from './glSpriteBatch';
import { scopeModuleMocks } from './moduleMockTestHelper';

let beginGlRenderPass: typeof GlRenderGlModule.beginGlRenderPass;
let createGlRenderStateRuntime: typeof GlRenderGlModule.createGlRenderStateRuntime;
let createGlRenderTarget: typeof GlRenderGlModule.createGlRenderTarget;
let createGlCacheState: typeof GlCacheModule.createGlCacheState;
let defaultGlRenderTargetNode2DRenderer: typeof GlRenderTargetNode2DModule.defaultGlRenderTargetNode2DRenderer;
let destroyGlRenderTarget: typeof GlRenderGlModule.destroyGlRenderTarget;
let destroyGlRenderTargetNode2D: typeof GlRenderTargetNode2DModule.destroyGlRenderTargetNode2D;
let drawGlRenderTargetResult: typeof GlRenderGlModule.drawGlRenderTargetResult;
let enableGlRenderTargetNode2D: typeof GlRenderTargetNode2DModule.enableGlRenderTargetNode2D;
let endGlRenderPass: typeof GlRenderGlModule.endGlRenderPass;
let flushGlSpriteBatch: typeof GlSpriteBatchModule.flushGlSpriteBatch;
let getGlRenderStateRuntime: typeof GlRenderGlModule.getGlRenderStateRuntime;
let popGlRenderState: typeof GlRenderGlModule.popGlRenderState;
let pushGlRenderState: typeof GlRenderGlModule.pushGlRenderState;
let renderIntoGlRenderTargetNode2D: typeof GlRenderTargetNode2DModule.renderIntoGlRenderTargetNode2D;
let refreshGlRenderCache: typeof GlCacheModule.refreshGlRenderCache;
let resizeGlRenderTarget: typeof GlRenderGlModule.resizeGlRenderTarget;

scopeModuleMocks(['./glCache', './glSpriteBatch', '@flighthq/render-gl']);

beforeAll(async () => {
  vi.doMock('./glSpriteBatch', async (importOriginal) => {
    const actual = await importOriginal<typeof GlSpriteBatchModule>();
    return { ...actual, flushGlSpriteBatch: vi.fn() };
  });
  vi.doMock('@flighthq/render-gl/contract', async (importOriginal) => {
    const actual = await importOriginal<typeof GlRenderGlModule>();
    return {
      ...actual,
      beginGlRenderPass: vi.fn(),
      createGlRenderTarget: vi.fn(
        (_state: unknown, descriptor: { width: number; height: number; depth?: string }): GlRenderTarget => {
          const texture = {} as WebGLTexture;
          return {
            clearColors: [],
            clearDepth: 1,
            colorRenderbuffers: [],
            colorSpace: 'srgb',
            depthStencilRenderbuffer: descriptor.depth === 'depth-stencil' ? ({} as WebGLRenderbuffer) : null,
            depthTexture: null,
            format: 'rgba8',
            framebuffer: {} as WebGLFramebuffer,
            height: descriptor.height,
            resolveFramebuffer: null,
            sampleCount: 1,
            texture,
            textures: [texture],
            width: descriptor.width,
          };
        },
      ),
      destroyGlRenderTarget: vi.fn(),
      drawGlRenderTargetResult: vi.fn(),
      endGlRenderPass: vi.fn(),
      popGlRenderState: vi.fn(),
      pushGlRenderState: vi.fn(),
      resizeGlRenderTarget: vi.fn((_state: unknown, target: GlRenderTarget, width: number, height: number) => {
        target.width = width;
        target.height = height;
      }),
    };
  });

  ({
    beginGlRenderPass,
    createGlRenderStateRuntime,
    createGlRenderTarget,
    destroyGlRenderTarget,
    drawGlRenderTargetResult,
    endGlRenderPass,
    getGlRenderStateRuntime,
    popGlRenderState,
    pushGlRenderState,
    resizeGlRenderTarget,
  } = await import('@flighthq/render-gl/contract'));
  ({ createGlCacheState, refreshGlRenderCache } = await import('./glCache'));
  ({ flushGlSpriteBatch } = await import('./glSpriteBatch'));
  ({
    defaultGlRenderTargetNode2DRenderer,
    destroyGlRenderTargetNode2D,
    enableGlRenderTargetNode2D,
    renderIntoGlRenderTargetNode2D,
  } = await import('./glRenderTargetNode2D'));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('defaultGlRenderTargetNode2DRenderer', () => {
  it('does nothing before the node has been populated', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ width: 32, height: 16 });

    defaultGlRenderTargetNode2DRenderer.submit(state, createRenderProxy(node));

    expect(flushGlSpriteBatch).not.toHaveBeenCalled();
    expect(drawGlRenderTargetResult).not.toHaveBeenCalled();
  });

  it('flushes pending sprites then composites the populated target', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ width: 32, height: 16 });
    renderIntoGlRenderTargetNode2D(state, node, () => {});
    vi.mocked(flushGlSpriteBatch).mockClear();
    vi.mocked(drawGlRenderTargetResult).mockClear();

    const renderProxy = createRenderProxy(node);
    defaultGlRenderTargetNode2DRenderer.submit(state, renderProxy);

    expect(flushGlSpriteBatch).toHaveBeenCalledWith(state);
    expect(drawGlRenderTargetResult).toHaveBeenCalledWith(state, renderProxy, expect.anything(), expect.anything());
    expect(vi.mocked(flushGlSpriteBatch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(drawGlRenderTargetResult).mock.invocationCallOrder[0],
    );
  });

  it('composites a screen-owned target while a cache state walks the node', () => {
    const screenState = createState();
    const cacheState = createGlCacheState(screenState);
    const node = createRenderTargetNode2D({ width: 32, height: 16 });
    renderIntoGlRenderTargetNode2D(screenState, node, () => {});
    const target = vi.mocked(createGlRenderTarget).mock.results.at(-1)?.value as GlRenderTarget;
    vi.mocked(drawGlRenderTargetResult).mockClear();

    const renderProxy = createRenderProxy(node);
    defaultGlRenderTargetNode2DRenderer.submit(cacheState, renderProxy);

    expect(drawGlRenderTargetResult).toHaveBeenCalledWith(cacheState, renderProxy, target, expect.anything());
  });
});

describe('destroyGlRenderTargetNode2D', () => {
  it('frees the screen-owned target and recreates it on the next population', () => {
    const screenState = createState();
    const cacheState = createGlCacheState(screenState);
    const node = createRenderTargetNode2D({ width: 32, height: 16 });
    renderIntoGlRenderTargetNode2D(screenState, node, () => {});
    const target = vi.mocked(createGlRenderTarget).mock.results.at(-1)?.value as GlRenderTarget;

    destroyGlRenderTargetNode2D(cacheState, node);

    expect(destroyGlRenderTarget).toHaveBeenCalledWith(screenState, target);

    renderIntoGlRenderTargetNode2D(screenState, node, () => {});
    expect(createGlRenderTarget).toHaveBeenCalledTimes(2);
  });
});

describe('enableGlRenderTargetNode2D', () => {
  it('registers the compositor renderer for the node kind', () => {
    const state = createState();

    enableGlRenderTargetNode2D(state);

    expect(getGlRenderStateRuntime(state).rendererMap.get(RenderTargetNode2DKind)).toBe(
      defaultGlRenderTargetNode2DRenderer,
    );
  });
});

describe('renderIntoGlRenderTargetNode2D', () => {
  it('creates a target with the node dimensions and requested depth', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ width: 64, height: 48, depth: true });

    renderIntoGlRenderTargetNode2D(state, node, () => {});

    expect(createGlRenderTarget).toHaveBeenCalledWith(state, {
      depth: 'depth-stencil',
      height: 48,
      width: 64,
    });
  });

  it('brackets the callback with GL state and render-pass restoration', () => {
    const state = createState();
    const callback = vi.fn();

    renderIntoGlRenderTargetNode2D(state, createRenderTargetNode2D({ width: 8, height: 8 }), callback);

    expect(callback).toHaveBeenCalledWith(state);
    const order = [
      vi.mocked(pushGlRenderState).mock.invocationCallOrder.at(-1),
      vi.mocked(beginGlRenderPass).mock.invocationCallOrder.at(-1),
      callback.mock.invocationCallOrder.at(-1),
      vi.mocked(endGlRenderPass).mock.invocationCallOrder.at(-1),
      vi.mocked(popGlRenderState).mock.invocationCallOrder.at(-1),
    ];
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it('ends the render pass and restores GL state when the callback throws', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ width: 8, height: 8 });

    expect(() =>
      renderIntoGlRenderTargetNode2D(state, node, () => {
        throw new Error('foreign render failed');
      }),
    ).toThrow('foreign render failed');

    expect(endGlRenderPass).toHaveBeenCalledWith(state);
    expect(popGlRenderState).toHaveBeenCalledWith(state);
  });

  it('reuses and resizes the node target on later populations', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ width: 64, height: 48 });
    renderIntoGlRenderTargetNode2D(state, node, () => {});
    const target = vi.mocked(createGlRenderTarget).mock.results.at(-1)?.value as GlRenderTarget;

    node.data.width = 24;
    node.data.height = 12;
    renderIntoGlRenderTargetNode2D(state, node, () => {});

    expect(createGlRenderTarget).toHaveBeenCalledTimes(1);
    expect(resizeGlRenderTarget).toHaveBeenLastCalledWith(state, target, 24, 12);
  });

  it('keeps backing targets isolated per render state', () => {
    const node = createRenderTargetNode2D({ width: 8, height: 8 });

    renderIntoGlRenderTargetNode2D(createState(), node, () => {});
    renderIntoGlRenderTargetNode2D(createState(), node, () => {});

    expect(createGlRenderTarget).toHaveBeenCalledTimes(2);
  });

  it('keeps tracked GL state clean across a cache bake and node population in one frame', () => {
    const screenState = createState();
    const cacheState = createGlCacheState(screenState);
    const runtime = getGlRenderStateRuntime(screenState);
    runtime.currentProgram = { id: 'stale-program' } as unknown as WebGLProgram;
    runtime.currentTexture = { id: 'stale-texture' } as unknown as WebGLTexture;
    runtime.currentBlendMode = 'Add';
    runtime.currentScissorRect = { height: 4, width: 3, x: 1, y: 2 };

    refreshGlRenderCache(cacheState, createRenderCache(), createDisplayObject(), { padding: 1 });
    expectTrackedStateToBeClean(screenState);

    let saved:
      | {
          blendMode: GlRenderStateRuntime['currentBlendMode'];
          program: GlRenderStateRuntime['currentProgram'];
          scissorRect: GlRenderStateRuntime['currentScissorRect'];
          texture: GlRenderStateRuntime['currentTexture'];
        }
      | undefined;
    vi.mocked(pushGlRenderState).mockImplementationOnce((state) => {
      const current = getGlRenderStateRuntime(state);
      saved = {
        blendMode: current.currentBlendMode,
        program: current.currentProgram,
        scissorRect: current.currentScissorRect,
        texture: current.currentTexture,
      };
    });
    vi.mocked(popGlRenderState).mockImplementationOnce((state) => {
      const current = getGlRenderStateRuntime(state);
      current.currentBlendMode = saved!.blendMode;
      current.currentProgram = saved!.program;
      current.currentScissorRect = saved!.scissorRect;
      current.currentTexture = saved!.texture;
    });

    const node = createRenderTargetNode2D({ width: 16, height: 16 });
    renderIntoGlRenderTargetNode2D(screenState, node, (state) => {
      const current = getGlRenderStateRuntime(state);
      current.currentProgram = { id: 'foreign-program' } as unknown as WebGLProgram;
      current.currentTexture = { id: 'foreign-texture' } as unknown as WebGLTexture;
      current.currentBlendMode = 'Multiply';
      current.currentScissorRect = { height: 8, width: 7, x: 5, y: 6 };
    });
    expectTrackedStateToBeClean(screenState);

    vi.mocked(drawGlRenderTargetResult).mockImplementationOnce((state) => {
      expectTrackedStateToBeClean(state);
    });
    defaultGlRenderTargetNode2DRenderer.submit(screenState, createRenderProxy(node));
    expect(drawGlRenderTargetResult).toHaveBeenCalled();
  });
});

function createRenderProxy(source: RenderTargetNode2D): RenderProxy2D {
  return {
    alpha: 1,
    blendMode: 'Normal',
    source,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as RenderProxy2D;
}

function createState(): GlRenderState {
  const state = createRenderState() as GlRenderState;
  (state as { gl: Partial<WebGL2RenderingContext> }).gl = {
    clear: vi.fn(),
    clearColor: vi.fn(),
    COLOR_BUFFER_BIT: 0x4000,
  };
  state[EntityRuntimeKey] = createGlRenderStateRuntime();
  return state;
}

function expectTrackedStateToBeClean(state: GlRenderState): void {
  const runtime = getGlRenderStateRuntime(state);
  expect(runtime.currentBlendMode).toBeNull();
  expect(runtime.currentProgram).toBeNull();
  expect(runtime.currentScissorRect).toBeNull();
  expect(runtime.currentTexture).toBeNull();
}
