import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { beginWgpuScreenRenderPassForTest, submitWgpuFrame } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { createTextLabel } from '@flighthq/text/contract';
import * as textlayout from '@flighthq/textlayout/contract';
import type { ImageSurface, RenderProxy2D } from '@flighthq/types/contract';
import { BatchFormat, EntityRuntimeKey } from '@flighthq/types/contract';

import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';
import { wgpuTextLabelRenderer, drawWgpuTextLabel } from './wgpuTextLabel';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

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
});

function createTestImageSurface(width: number, height: number): ImageSurface {
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

function makeTextData() {
  return {
    surface: createTestImageSurface(1, 1),
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

function createTestImageSurfaceCreator(destroyImageSurface: (surface: ImageSurface) => void = () => {}) {
  return {
    [EntityRuntimeKey]: undefined,
    createImageSurface(width: number, height: number) {
      return createTestImageSurface(width, height);
    },
    destroyImageSurface,
  };
}

describe('drawWgpuTextLabel', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', async () => {
    const state = await createWgpuRenderStateForTest();
    state.imageSurfaceProvider = createTestImageSurfaceCreator();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    const firstData = wgpuTextLabelRenderer.createData!(state, createTextLabel())!;
    const secondData = wgpuTextLabelRenderer.createData!(state, createTextLabel())!;

    drawWgpuTextLabel(state, makeTextProxy('first', firstData));
    drawWgpuTextLabel(state, makeTextProxy('second', secondData));

    const firstSurface = (firstData as unknown as { surface: ImageSurface }).surface;
    const secondSurface = (secondData as unknown as { surface: ImageSurface }).surface;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const firstImage = firstSurface.image;
    expect(firstSurface).not.toBe(secondSurface);
    expect(firstSurface.image).not.toBe(secondSurface.image);
    expect(cache.get(firstSurface.image)?.texture).not.toBe(cache.get(secondSurface.image)?.texture);

    drawWgpuTextLabel(state, makeTextProxy('first', firstData));
    expect((firstData as unknown as { surface: ImageSurface }).surface).toBe(firstSurface);
    expect(firstSurface.image).toBe(firstImage);
    submitWgpuFrame(state);
  });

  it('returns early when text is empty', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    expect(() => drawWgpuTextLabel(state, makeTextProxy('', makeTextData()))).not.toThrow();
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
    submitWgpuFrame(state);
  });

  it('writes one instance to the quad-batch writer when text has content', async () => {
    const state = await createWgpuRenderStateForTest();
    state.imageSurfaceProvider = createTestImageSurfaceCreator();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    drawWgpuTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
    submitWgpuFrame(state);
  });

  it('rasterizes packed run alpha into the canvas color', async () => {
    const state = await createWgpuRenderStateForTest();
    state.imageSurfaceProvider = createTestImageSurfaceCreator();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    (proxy.source as ReturnType<typeof createTextLabel>).data.textFormat = { color: 0xff000080 };
    const styles: Array<string | CanvasGradient | CanvasPattern> = [];
    vi.spyOn(data.surface.context, 'fillText').mockImplementation(() => styles.push(data.surface.context.fillStyle));

    drawWgpuTextLabel(state, proxy);

    expect(styles).toEqual(['rgba(255, 0, 0, 0.5019607843137255)']);
    submitWgpuFrame(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWgpuRenderStateForTest();
    state.imageSurfaceProvider = createTestImageSurfaceCreator();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawWgpuTextLabel(state, proxy);
    const updateSpy = vi.spyOn(getWgpuRenderStateRuntime(state).context.textureCache, 'get');
    proxy.alpha = 0.5;
    drawWgpuTextLabel(state, proxy);
    // Version is unchanged, so the rasterization block is skipped entirely on the second draw.
    expect((proxy.rendererData as any).lastContentId).toBe(0);
    submitWgpuFrame(state);
    updateSpy.mockRestore();
  });
});

describe('wgpuTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(wgpuTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has createData and submit functions', () => {
    expect(typeof wgpuTextLabelRenderer.createData).toBe('function');
    expect(typeof wgpuTextLabelRenderer.submit).toBe('function');
  });

  it('removes the GPU cache entry before returning the node surface to its creator', async () => {
    const order: string[] = [];
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    state.imageSurfaceProvider = createTestImageSurfaceCreator((surface) => {
      order.push('surface');
      expect(cache.has(surface.image)).toBe(false);
    });
    registerWgpuStandardMaterial(state);
    const data = wgpuTextLabelRenderer.createData!(state, createTextLabel())!;
    drawWgpuTextLabel(state, makeTextProxy('owned', data));
    const surface = (data as unknown as { surface: ImageSurface }).surface;
    const entry = cache.get(surface.image)!;
    submitWgpuFrame(state);
    vi.spyOn(entry.texture, 'destroy').mockImplementation(() => {
      order.push('texture');
    });

    wgpuTextLabelRenderer.destroyData!(state, data);

    expect(cache.has(surface.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });
});
