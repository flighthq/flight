import type * as GlRenderGlModule from '@flighthq/render-gl/contract';
import { createRenderState } from '@flighthq/render/contract';
import { createRenderTargetNode2D } from '@flighthq/scene2d/contract';
import type { GlRenderState, GlRenderTarget, RenderProxy2D, RenderTargetNode2D } from '@flighthq/types/contract';
import { EntityRuntimeKey, RenderTargetNode2DKind } from '@flighthq/types/contract';

import type * as GlRenderTargetNode2DModule from './glRenderTargetNode2D';
import type * as GlSpriteBatchModule from './glSpriteBatch';
import { scopeModuleMocks } from './moduleMockTestHelper';

let beginGlRenderPass: typeof GlRenderGlModule.beginGlRenderPass;
let createGlRenderStateRuntime: typeof GlRenderGlModule.createGlRenderStateRuntime;
let createGlRenderTarget: typeof GlRenderGlModule.createGlRenderTarget;
let defaultGlRenderTargetNode2DRenderer: typeof GlRenderTargetNode2DModule.defaultGlRenderTargetNode2DRenderer;
let drawGlRenderTargetResult: typeof GlRenderGlModule.drawGlRenderTargetResult;
let enableGlRenderTargetNode2D: typeof GlRenderTargetNode2DModule.enableGlRenderTargetNode2D;
let endGlRenderPass: typeof GlRenderGlModule.endGlRenderPass;
let flushGlSpriteBatch: typeof GlSpriteBatchModule.flushGlSpriteBatch;
let getGlRenderStateRuntime: typeof GlRenderGlModule.getGlRenderStateRuntime;
let popGlRenderState: typeof GlRenderGlModule.popGlRenderState;
let pushGlRenderState: typeof GlRenderGlModule.pushGlRenderState;
let renderIntoGlRenderTargetNode2D: typeof GlRenderTargetNode2DModule.renderIntoGlRenderTargetNode2D;
let resizeGlRenderTarget: typeof GlRenderGlModule.resizeGlRenderTarget;

scopeModuleMocks(['./glSpriteBatch', '@flighthq/render-gl']);

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
    drawGlRenderTargetResult,
    endGlRenderPass,
    getGlRenderStateRuntime,
    popGlRenderState,
    pushGlRenderState,
    resizeGlRenderTarget,
  } = await import('@flighthq/render-gl/contract'));
  ({ flushGlSpriteBatch } = await import('./glSpriteBatch'));
  ({ defaultGlRenderTargetNode2DRenderer, enableGlRenderTargetNode2D, renderIntoGlRenderTargetNode2D } =
    await import('./glRenderTargetNode2D'));
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
  state[EntityRuntimeKey] = createGlRenderStateRuntime();
  return state;
}
