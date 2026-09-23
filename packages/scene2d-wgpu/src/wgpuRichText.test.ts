import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import {
  beginWgpuScreenRenderPassForTest,
  getWgpuRenderStateRuntime,
  submitWgpuFrame,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import type { CanvasSurface, HostCanvasCapability, HostImageCapability, ImageResource } from '@flighthq/types/contract';

import { getWgpuRendererData } from './wgpuRendererData';
import {
  createWgpuRichTextData,
  wgpuRichTextRenderer,
  destroyWgpuRichTextData,
  drawWgpuRichText,
  drawWgpuRichTextWithOverlay,
  registerWgpuTextInputOverlay,
} from './wgpuRichText';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

beforeAll(() => {
  installWgpuMock();
});

function createTestSurface(width: number, height: number): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  return {
    get width() {
      return canvas.width;
    },
    set width(value: number) {
      canvas.width = value;
    },
    get height() {
      return canvas.height;
    },
    set height(value: number) {
      canvas.height = value;
    },
    context,
  } as unknown as CanvasSurface;
}

function createTestCanvasHost(onDestroy: (surface: CanvasSurface) => void = () => {}): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface: onDestroy,
    release() {},
  };
}

function createTestImageHost(): HostImageCapability {
  return {
    createImageFromSurface(surface) {
      return createImageResource((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas);
    },
    loadImageFromUrl: () => Promise.reject(new Error('not implemented')),
  };
}

function setTestHosts(
  state: { canvasHost: unknown; imageHost: unknown },
  onDestroy?: (surface: CanvasSurface) => void,
): void {
  state.canvasHost = createTestCanvasHost(onDestroy);
  state.imageHost = createTestImageHost();
}

describe('createWgpuRichTextData', () => {
  it('starts without a raster surface until the node first draws', () => {
    const data = createWgpuRichTextData({} as never, {} as never);
    expect(getWgpuRendererData<{ surface: CanvasSurface | null }>(data)?.surface).toBeNull();
  });
});

describe('destroyWgpuRichTextData', () => {
  it('removes the GPU cache entry before returning the node surface to its creator', async () => {
    const order: string[] = [];
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    setTestHosts(state, () => {
      order.push('surface');
      expect(cache.has(richData.image!)).toBe(false);
    });
    const source = createRichText({ data: { height: 40, text: 'owned', width: 100 } });
    prepareScene2DRender(state, source);
    const proxy = getOrCreateRenderProxy2D(state, source);
    proxy.rendererData = createWgpuRichTextData(state, source);
    drawWgpuRichText(state, proxy);
    const richData = getWgpuRendererData<{ surface: CanvasSurface; image: ImageResource }>(proxy.rendererData)!;
    const entry = cache.get(richData.image)!;
    submitWgpuFrame(state);
    vi.spyOn(entry.texture, 'destroy').mockImplementation(() => {
      order.push('texture');
    });

    destroyWgpuRichTextData(state, proxy.rendererData!);

    expect(cache.has(richData.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('is a no-op when no surface was allocated', () => {
    expect(() => destroyWgpuRichTextData({} as never, { surface: null } as never)).not.toThrow();
  });
});

describe('drawWgpuRichText', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    const first = createRichText({ data: { height: 40, text: 'first', width: 100 } });
    const second = createRichText({ data: { height: 40, text: 'second', width: 100 } });
    prepareScene2DRender(state, first);
    prepareScene2DRender(state, second);
    const firstProxy = getOrCreateRenderProxy2D(state, first);
    const secondProxy = getOrCreateRenderProxy2D(state, second);
    firstProxy.rendererData = createWgpuRichTextData(state, first);
    secondProxy.rendererData = createWgpuRichTextData(state, second);

    drawWgpuRichText(state, firstProxy);
    drawWgpuRichText(state, secondProxy);

    const firstOwned = getWgpuRendererData<{ surface: CanvasSurface | null; image: ImageResource | null }>(
      firstProxy.rendererData,
    )!;
    const secondOwned = getWgpuRendererData<{ surface: CanvasSurface | null; image: ImageResource | null }>(
      secondProxy.rendererData,
    )!;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    expect(firstOwned.surface).not.toBeNull();
    expect(secondOwned.surface).not.toBeNull();
    const firstSurface = firstOwned.surface!;
    const firstImage = firstOwned.image!;
    expect(firstOwned.surface).not.toBe(secondOwned.surface);
    expect(firstOwned.image).not.toBe(secondOwned.image);
    expect(cache.get(firstOwned.image!)?.texture).not.toBe(cache.get(secondOwned.image!)?.texture);

    drawWgpuRichText(state, firstProxy);
    expect(firstOwned.surface).toBe(firstSurface);
    expect(firstOwned.image).toBe(firstImage);
    submitWgpuFrame(state);
  });

  it('does not throw for empty rich text', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);

    const richText = createRichText();
    prepareScene2DRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWgpuRichText(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const richText = createRichText();
    prepareScene2DRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWgpuRichText(state, renderProxy)).not.toThrow();
  });
});

describe('drawWgpuRichTextWithOverlay', () => {
  it('does not throw for empty rich text', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const richText = createRichText();
    prepareScene2DRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);
    expect(() => drawWgpuRichTextWithOverlay(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('registerWgpuTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', async () => {
    const overlay = vi.fn();
    registerWgpuTextInputOverlay(overlay);
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);

    const plain = createRichText({ data: { height: 40, text: 'x', width: 100 } });
    prepareScene2DRender(state, plain);
    const plainProxy = getOrCreateRenderProxy2D(state, plain);
    plainProxy.rendererData = createWgpuRichTextData(state, plain);
    drawWgpuRichText(state, plainProxy);
    expect(overlay).not.toHaveBeenCalled();

    const editable = createRichText({ data: { height: 40, text: 'x', width: 100 } });
    enableTextInput(editable);
    prepareScene2DRender(state, editable);
    const editableProxy = getOrCreateRenderProxy2D(state, editable);
    editableProxy.rendererData = createWgpuRichTextData(state, editable);
    drawWgpuRichText(state, editableProxy);
    expect(overlay).toHaveBeenCalled();
    submitWgpuFrame(state);
  });
});

describe('wgpuRichTextRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof wgpuRichTextRenderer.createData).toBe('function');
    expect(typeof wgpuRichTextRenderer.submit).toBe('function');
  });
});
