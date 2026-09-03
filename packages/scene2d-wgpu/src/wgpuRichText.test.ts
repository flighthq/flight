import { createImageResource } from '@flighthq/image/contract';
import { getWgpuRenderStateRuntime, renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import {
  getOrCreateRenderProxy2D,
  prepareScene2DRender,
  resetRaster2DSurfaceProviderForTest,
  setRaster2DSurfaceProvider,
} from '@flighthq/render/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import type { Raster2DSurface } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { getWgpuRendererData } from './wgpuRendererData';
import {
  createWgpuRichTextData,
  defaultWgpuRichTextRenderer,
  destroyWgpuRichTextData,
  drawWgpuRichText,
  drawWgpuRichTextWithOverlay,
  registerWgpuTextInputOverlay,
} from './wgpuRichText';

beforeAll(() => {
  installWgpuMock();
});

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

function createTestRaster2DSurface(width: number, height: number): Raster2DSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  return {
    [EntityRuntimeKey]: undefined,
    get width() {
      return canvas.width;
    },
    set width(value) {
      canvas.width = value;
    },
    get height() {
      return canvas.height;
    },
    set height(value) {
      canvas.height = value;
    },
    context,
    image: createImageResource(canvas),
  };
}

function installTestRaster2DSurfaceProvider(
  destroyRaster2DSurface: (surface: Raster2DSurface) => void = () => {},
): void {
  setRaster2DSurfaceProvider({
    [EntityRuntimeKey]: undefined,
    createRaster2DSurface(width, height) {
      return createTestRaster2DSurface(width, height);
    },
    destroyRaster2DSurface,
  });
}

describe('createWgpuRichTextData', () => {
  it('starts without a raster surface until the node first draws', () => {
    const data = createWgpuRichTextData({} as never, {} as never);
    expect(getWgpuRendererData<{ surface: Raster2DSurface | null }>(data)?.surface).toBeNull();
  });
});

describe('defaultWgpuRichTextRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWgpuRichTextRenderer.createData).toBe('function');
    expect(typeof defaultWgpuRichTextRenderer.submit).toBe('function');
  });
});

describe('destroyWgpuRichTextData', () => {
  it('removes the GPU cache entry before returning the node surface to its creator', async () => {
    const order: string[] = [];
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    installTestRaster2DSurfaceProvider((surface) => {
      order.push('surface');
      expect(cache.has(surface.image)).toBe(false);
    });
    const source = createRichText({ data: { height: 40, text: 'owned', width: 100 } });
    prepareScene2DRender(state, source);
    const proxy = getOrCreateRenderProxy2D(state, source);
    proxy.rendererData = createWgpuRichTextData(state, source);
    drawWgpuRichText(state, proxy);
    const surface = getWgpuRendererData<{ surface: Raster2DSurface }>(proxy.rendererData)!.surface;
    const entry = cache.get(surface.image)!;
    submitWgpuRenderPass(state);
    vi.spyOn(entry.texture, 'destroy').mockImplementation(() => {
      order.push('texture');
    });

    destroyWgpuRichTextData(state, proxy.rendererData!);

    expect(cache.has(surface.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('is a no-op when no surface was allocated', () => {
    expect(() => destroyWgpuRichTextData({} as never, { surface: null } as never)).not.toThrow();
  });
});

describe('drawWgpuRichText', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', async () => {
    installTestRaster2DSurfaceProvider();
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
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

    const firstOwned = getWgpuRendererData<{ surface: Raster2DSurface | null }>(firstProxy.rendererData)!;
    const secondOwned = getWgpuRendererData<{ surface: Raster2DSurface | null }>(secondProxy.rendererData)!;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    expect(firstOwned.surface).not.toBeNull();
    expect(secondOwned.surface).not.toBeNull();
    const firstSurface = firstOwned.surface!;
    const firstImage = firstSurface.image;
    expect(firstOwned.surface).not.toBe(secondOwned.surface);
    expect(firstOwned.surface!.image).not.toBe(secondOwned.surface!.image);
    expect(cache.get(firstOwned.surface!.image)?.texture).not.toBe(cache.get(secondOwned.surface!.image)?.texture);

    drawWgpuRichText(state, firstProxy);
    expect(firstOwned.surface).toBe(firstSurface);
    expect(firstOwned.surface!.image).toBe(firstImage);
    submitWgpuRenderPass(state);
  });

  it('does not throw for empty rich text', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const richText = createRichText();
    prepareScene2DRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);

    expect(() => drawWgpuRichText(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
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
    renderWgpuBackground(state);
    const richText = createRichText();
    prepareScene2DRender(state, richText);
    const renderProxy = getOrCreateRenderProxy2D(state, richText);
    expect(() => drawWgpuRichTextWithOverlay(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('registerWgpuTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', async () => {
    installTestRaster2DSurfaceProvider();
    const overlay = vi.fn();
    registerWgpuTextInputOverlay(overlay);
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

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
    submitWgpuRenderPass(state);
  });
});
