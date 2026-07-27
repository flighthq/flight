import type * as WgpuRenderWgpuModule from '@flighthq/render-wgpu/contract';
import { createRenderProxy2D, createRenderState, setRenderStateBackgroundColor } from '@flighthq/render/contract';
import { createRenderTargetNode2D } from '@flighthq/scene2d/contract';
import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';
import { EntityRuntimeKey, RenderTargetNode2DKind } from '@flighthq/types/contract';

import { scopeModuleMocks } from './moduleMockTestHelper';
import type * as WgpuCacheModule from './wgpuCache';
import type * as WgpuRenderTargetNode2DModule from './wgpuRenderTargetNode2D';
import type * as WgpuSpriteBatchModule from './wgpuSpriteBatch';

let beginWgpuFrame: typeof WgpuRenderWgpuModule.beginWgpuFrame;
let beginWgpuRenderPass: typeof WgpuRenderWgpuModule.beginWgpuRenderPass;
let createWgpuCacheState: typeof WgpuCacheModule.createWgpuCacheState;
let createWgpuRenderStateRuntime: typeof WgpuRenderWgpuModule.createWgpuRenderStateRuntime;
let createWgpuRenderTarget: typeof WgpuRenderWgpuModule.createWgpuRenderTarget;
let defaultWgpuRenderTargetNode2DRenderer: typeof WgpuRenderTargetNode2DModule.defaultWgpuRenderTargetNode2DRenderer;
let destroyWgpuRenderTarget: typeof WgpuRenderWgpuModule.destroyWgpuRenderTarget;
let destroyWgpuRenderTargetNode2D: typeof WgpuRenderTargetNode2DModule.destroyWgpuRenderTargetNode2D;
let drawWgpuRenderTargetResult: typeof WgpuRenderWgpuModule.drawWgpuRenderTargetResult;
let enableWgpuRenderTargetNode2D: typeof WgpuRenderTargetNode2DModule.enableWgpuRenderTargetNode2D;
let endWgpuRenderPass: typeof WgpuRenderWgpuModule.endWgpuRenderPass;
let flushWgpuSpriteBatch: typeof WgpuSpriteBatchModule.flushWgpuSpriteBatch;
let getWgpuRenderStateRuntime: typeof WgpuRenderWgpuModule.getWgpuRenderStateRuntime;
let renderIntoWgpuRenderTargetNode2D: typeof WgpuRenderTargetNode2DModule.renderIntoWgpuRenderTargetNode2D;
let resizeWgpuRenderTarget: typeof WgpuRenderWgpuModule.resizeWgpuRenderTarget;
let submitWgpuRenderPass: typeof WgpuRenderWgpuModule.submitWgpuRenderPass;

scopeModuleMocks(['./wgpuCache', './wgpuSpriteBatch', '@flighthq/render-wgpu']);

beforeAll(async () => {
  vi.doMock('./wgpuSpriteBatch', async (importOriginal) => {
    const actual = await importOriginal<typeof WgpuSpriteBatchModule>();
    return { ...actual, flushWgpuSpriteBatch: vi.fn() };
  });
  vi.doMock('@flighthq/render-wgpu/contract', async (importOriginal) => {
    const actual = await importOriginal<typeof WgpuRenderWgpuModule>();
    return {
      ...actual,
      beginWgpuFrame: vi.fn((state: WgpuRenderState) => {
        getWgpuRenderStateRuntime(state).commandEncoder = {} as GPUCommandEncoder;
      }),
      beginWgpuRenderPass: vi.fn(),
      createWgpuRenderTarget: vi.fn(
        (_state: unknown, width: number, height: number): WgpuRenderTarget => ({
          bindGroup: {} as GPUBindGroup,
          clearColors: [],
          clearDepth: 1,
          colorSpace: 'srgb',
          depthStencilTexture: {} as GPUTexture,
          depthStencilView: {} as GPUTextureView,
          format: 'bgra8unorm',
          height,
          texture: {} as GPUTexture,
          view: {} as GPUTextureView,
          width,
        }),
      ),
      destroyWgpuRenderTarget: vi.fn(),
      drawWgpuRenderTargetResult: vi.fn(),
      endWgpuRenderPass: vi.fn(),
      resizeWgpuRenderTarget: vi.fn((_state: unknown, target: WgpuRenderTarget, width: number, height: number) => {
        target.width = width;
        target.height = height;
      }),
      submitWgpuRenderPass: vi.fn((state: WgpuRenderState) => {
        getWgpuRenderStateRuntime(state).commandEncoder = null;
      }),
    };
  });

  ({
    beginWgpuFrame,
    beginWgpuRenderPass,
    createWgpuRenderStateRuntime,
    createWgpuRenderTarget,
    destroyWgpuRenderTarget,
    drawWgpuRenderTargetResult,
    endWgpuRenderPass,
    getWgpuRenderStateRuntime,
    resizeWgpuRenderTarget,
    submitWgpuRenderPass,
  } = await import('@flighthq/render-wgpu/contract'));
  ({ createWgpuCacheState } = await import('./wgpuCache'));
  ({ flushWgpuSpriteBatch } = await import('./wgpuSpriteBatch'));
  ({
    defaultWgpuRenderTargetNode2DRenderer,
    destroyWgpuRenderTargetNode2D,
    enableWgpuRenderTargetNode2D,
    renderIntoWgpuRenderTargetNode2D,
  } = await import('./wgpuRenderTargetNode2D'));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('defaultWgpuRenderTargetNode2DRenderer', () => {
  it('does nothing before the node has been populated', () => {
    const state = createState();

    defaultWgpuRenderTargetNode2DRenderer.submit(
      state,
      createRenderProxy2D(state, createRenderTargetNode2D({ height: 16, width: 32 })),
    );

    expect(flushWgpuSpriteBatch).not.toHaveBeenCalled();
    expect(drawWgpuRenderTargetResult).not.toHaveBeenCalled();
  });

  it('composites a screen-owned target while a cache state walks the node', () => {
    const screenState = createState();
    const cacheState = createWgpuCacheState(screenState);
    const node = createRenderTargetNode2D({ height: 16, width: 32 });
    renderIntoWgpuRenderTargetNode2D(screenState, node, () => {});
    const target = vi.mocked(createWgpuRenderTarget).mock.results.at(-1)?.value as WgpuRenderTarget;
    vi.mocked(drawWgpuRenderTargetResult).mockClear();

    const renderProxy = createRenderProxy2D(cacheState, node);
    defaultWgpuRenderTargetNode2DRenderer.submit(cacheState, renderProxy);

    expect(flushWgpuSpriteBatch).toHaveBeenCalledWith(cacheState);
    expect(drawWgpuRenderTargetResult).toHaveBeenCalledWith(cacheState, renderProxy, target, expect.anything());
    expect(vi.mocked(flushWgpuSpriteBatch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(drawWgpuRenderTargetResult).mock.invocationCallOrder[0],
    );
  });
});

describe('destroyWgpuRenderTargetNode2D', () => {
  it('destroys the screen-owned target and recreates it on the next population', () => {
    const screenState = createState();
    const cacheState = createWgpuCacheState(screenState);
    const node = createRenderTargetNode2D({ height: 16, width: 32 });
    renderIntoWgpuRenderTargetNode2D(screenState, node, () => {});
    const target = vi.mocked(createWgpuRenderTarget).mock.results.at(-1)?.value as WgpuRenderTarget;
    vi.mocked(createWgpuRenderTarget).mockClear();

    destroyWgpuRenderTargetNode2D(cacheState, node);

    expect(destroyWgpuRenderTarget).toHaveBeenCalledWith(screenState, target);

    renderIntoWgpuRenderTargetNode2D(screenState, node, () => {});
    expect(createWgpuRenderTarget).toHaveBeenCalledTimes(1);
  });
});

describe('enableWgpuRenderTargetNode2D', () => {
  it('registers the compositor renderer for the node kind', () => {
    const state = createState();

    enableWgpuRenderTargetNode2D(state);

    expect(getWgpuRenderStateRuntime(state).rendererMap.get(RenderTargetNode2DKind)).toBe(
      defaultWgpuRenderTargetNode2DRenderer,
    );
  });
});

describe('renderIntoWgpuRenderTargetNode2D', () => {
  it('clears the target with the owning screen state background', () => {
    const state = createState();
    setRenderStateBackgroundColor(state, 0x101018ff);

    renderIntoWgpuRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), () => {});

    const target = vi.mocked(createWgpuRenderTarget).mock.results.at(-1)?.value as WgpuRenderTarget;
    expect(target.clearColors[0]).toBe(0x101018ff);
  });

  it('hands the live frame and uniform cursor through a cache render state', () => {
    const screenState = createState();
    const screenRuntime = getWgpuRenderStateRuntime(screenState);
    const encoder = {} as GPUCommandEncoder;
    const pass = {} as GPURenderPassEncoder;
    screenRuntime.commandEncoder = encoder;
    screenRuntime.renderPass = pass;
    screenRuntime.uniformOffset = 128;
    const cacheState = createWgpuCacheState(screenState);

    renderIntoWgpuRenderTargetNode2D(cacheState, createRenderTargetNode2D({ height: 16, width: 32 }), (targetState) => {
      const cacheRuntime = getWgpuRenderStateRuntime(targetState);
      expect(cacheRuntime.commandEncoder).toBe(encoder);
      expect(cacheRuntime.renderPass).toBe(pass);
      expect(cacheRuntime.uniformOffset).toBe(128);
      cacheRuntime.uniformOffset = 256;
    });

    expect(screenRuntime.commandEncoder).toBe(encoder);
    expect(screenRuntime.renderPass).toBe(pass);
    expect(screenRuntime.uniformOffset).toBe(256);
    expect(beginWgpuFrame).not.toHaveBeenCalled();
    expect(submitWgpuRenderPass).not.toHaveBeenCalled();
  });

  it('opens and submits a standalone frame outside the visible frame', () => {
    const state = createState();

    renderIntoWgpuRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), () => {});

    expect(beginWgpuFrame).toHaveBeenCalledWith(state);
    expect(submitWgpuRenderPass).toHaveBeenCalledWith(state);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBeNull();
  });

  it('records into an active application frame without submitting it', () => {
    const state = createState();
    const encoder = {} as GPUCommandEncoder;
    getWgpuRenderStateRuntime(state).commandEncoder = encoder;

    renderIntoWgpuRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), () => {});

    expect(beginWgpuFrame).not.toHaveBeenCalled();
    expect(submitWgpuRenderPass).not.toHaveBeenCalled();
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBe(encoder);
  });

  it('restores and submits the frame when the callback throws', () => {
    const state = createState();

    expect(() =>
      renderIntoWgpuRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), () => {
        throw new Error('custom WebGPU draw failed');
      }),
    ).toThrow('custom WebGPU draw failed');

    expect(endWgpuRenderPass).toHaveBeenCalledWith(state);
    expect(submitWgpuRenderPass).toHaveBeenCalledWith(state);
  });

  it('reuses and resizes the target on later populations', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ height: 48, width: 64 });
    renderIntoWgpuRenderTargetNode2D(state, node, () => {});
    const target = vi.mocked(createWgpuRenderTarget).mock.results.at(-1)?.value as WgpuRenderTarget;

    node.data.width = 24;
    node.data.height = 12;
    renderIntoWgpuRenderTargetNode2D(state, node, () => {});

    expect(createWgpuRenderTarget).toHaveBeenCalledTimes(1);
    expect(resizeWgpuRenderTarget).toHaveBeenLastCalledWith(state, target, 24, 12);
  });

  it('wraps the callback in a WebGPU render pass', () => {
    const state = createState();
    const callback = vi.fn();

    renderIntoWgpuRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), callback);

    expect(callback).toHaveBeenCalledWith(state);
    const order = [
      vi.mocked(beginWgpuRenderPass).mock.invocationCallOrder.at(-1),
      callback.mock.invocationCallOrder.at(-1),
      vi.mocked(endWgpuRenderPass).mock.invocationCallOrder.at(-1),
    ];
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });
});

function createState(): WgpuRenderState {
  const state = createRenderState() as WgpuRenderState;
  (state as { device: GPUDevice }).device = {} as GPUDevice;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
  getWgpuRenderStateRuntime(state).commandEncoder = null;
  return state;
}
