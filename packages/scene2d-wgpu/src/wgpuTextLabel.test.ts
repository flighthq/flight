import { createImageResource } from '@flighthq/image/contract';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { resetRaster2DSurfaceProviderForTest, setRaster2DSurfaceProvider } from '@flighthq/render/contract';
import { createTextLabel } from '@flighthq/text/contract';
import * as textlayout from '@flighthq/textlayout/contract';
import type { Raster2DSurface, RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';
import { defaultWgpuTextLabelRenderer, drawWgpuTextLabel } from './wgpuTextLabel';

beforeAll(() => installWgpuMock());

// @flighthq/textlayout.computeTextLayout is stubbed to emit one deterministic glyph group.
beforeEach(() => {
  vi.spyOn(textlayout, 'computeTextLayout').mockImplementation(((
    result: { groups: object[] },
    params: { formatRanges: Array<{ format: object }> },
  ) => {
    result.groups.push({
      offsetX: 0,
      offsetY: 0,
      width: 50,
      ascent: 12,
      descent: 4,
      format: params.formatRanges[0]?.format ?? {},
      startIndex: 0,
      endIndex: 5,
    });
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetRaster2DSurfaceProviderForTest();
});

function createTestRaster2DSurface(width: number, height: number): Raster2DSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  return {
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

function makeTextData() {
  return {
    surface: createTestRaster2DSurface(1, 1),
    lastContentId: -1,
    lastPixelRatio: 0,
    logW: 0,
    logH: 0,
  };
}

function makeTextProxy(text = '', rendererData: unknown = null): RenderProxy2D {
  const source = createTextLabel();
  source.data.text = text;
  source.data.textFormat = {};
  source.data.width = 200;
  source.data.height = 100;
  return {
    source,
    blendMode: 0,
    alpha: 1,
    material: null,
    materialData: null,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData,
  } as unknown as RenderProxy2D;
}

function installTestRaster2DSurfaceProvider(
  destroyRaster2DSurface: (surface: Raster2DSurface) => void = () => {},
): void {
  setRaster2DSurfaceProvider({
    createRaster2DSurface(width, height) {
      return createTestRaster2DSurface(width, height);
    },
    destroyRaster2DSurface,
  });
}

describe('defaultWgpuTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(defaultWgpuTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof defaultWgpuTextLabelRenderer.createData).toBe('function');
    expect(typeof defaultWgpuTextLabelRenderer.submit).toBe('function');
  });

  it('removes the GPU cache entry before returning the node surface to its creator', async () => {
    const order: string[] = [];
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    installTestRaster2DSurfaceProvider((surface) => {
      order.push('surface');
      expect(cache.has(surface.image)).toBe(false);
    });
    registerWgpuStandardMaterial(state);
    const data = defaultWgpuTextLabelRenderer.createData!(state, createTextLabel())!;
    drawWgpuTextLabel(state, makeTextProxy('owned', data));
    const surface = (data as unknown as { surface: Raster2DSurface }).surface;
    const entry = cache.get(surface.image)!;
    submitWgpuRenderPass(state);
    vi.spyOn(entry.texture, 'destroy').mockImplementation(() => {
      order.push('texture');
    });

    defaultWgpuTextLabelRenderer.destroyData!(state, data);

    expect(cache.has(surface.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });
});

describe('drawWgpuTextLabel', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', async () => {
    installTestRaster2DSurfaceProvider();
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const firstData = defaultWgpuTextLabelRenderer.createData!(state, createTextLabel())!;
    const secondData = defaultWgpuTextLabelRenderer.createData!(state, createTextLabel())!;

    drawWgpuTextLabel(state, makeTextProxy('first', firstData));
    drawWgpuTextLabel(state, makeTextProxy('second', secondData));

    const firstSurface = (firstData as unknown as { surface: Raster2DSurface }).surface;
    const secondSurface = (secondData as unknown as { surface: Raster2DSurface }).surface;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const firstImage = firstSurface.image;
    expect(firstSurface).not.toBe(secondSurface);
    expect(firstSurface.image).not.toBe(secondSurface.image);
    expect(cache.get(firstSurface.image)?.texture).not.toBe(cache.get(secondSurface.image)?.texture);

    drawWgpuTextLabel(state, makeTextProxy('first', firstData));
    expect((firstData as unknown as { surface: Raster2DSurface }).surface).toBe(firstSurface);
    expect(firstSurface.image).toBe(firstImage);
    submitWgpuRenderPass(state);
  });

  it('returns early when text is empty', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    expect(() => drawWgpuTextLabel(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('writes one instance to the quad-batch writer when text has content', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    drawWgpuTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
    submitWgpuRenderPass(state);
  });

  it('rasterizes packed run alpha into the canvas color', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    (proxy.source as ReturnType<typeof createTextLabel>).data.textFormat = { color: 0xff000080 };
    const styles: Array<string | CanvasGradient | CanvasPattern> = [];
    vi.spyOn(data.surface.context, 'fillText').mockImplementation(() => styles.push(data.surface.context.fillStyle));

    drawWgpuTextLabel(state, proxy);

    expect(styles).toEqual(['rgba(255, 0, 0, 0.5019607843137255)']);
    submitWgpuRenderPass(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    registerWgpuStandardMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawWgpuTextLabel(state, proxy);
    const updateSpy = vi.spyOn(getWgpuRenderStateRuntime(state).context.textureCache, 'get');
    proxy.alpha = 0.5;
    drawWgpuTextLabel(state, proxy);
    // Version is unchanged, so the rasterization block is skipped entirely on the second draw.
    expect((proxy.rendererData as any).lastContentId).toBe(0);
    submitWgpuRenderPass(state);
    updateSpy.mockRestore();
  });
});
