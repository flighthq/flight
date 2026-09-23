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
import type {
  CanvasSurface,
  HostCanvasCapability,
  HostImageCapability,
  ImageResource,
  RenderProxy2D,
} from '@flighthq/types/contract';
import { BatchFormat } from '@flighthq/types/contract';

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

function createTestCanvasHost(destroyFn: (surface: CanvasSurface) => void = () => {}): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface: destroyFn,
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

function setTestHosts(state: { canvasHost: unknown; imageHost: unknown }): void {
  state.canvasHost = createTestCanvasHost();
  state.imageHost = createTestImageHost();
}

interface WgpuTextLabelDataView {
  image: ImageResource | null;
  surface: CanvasSurface | null;
  lastContentId: number;
  lastPixelRatio: number;
  logW: number;
  logH: number;
}

function makeTextData(): WgpuTextLabelDataView {
  const surface = createTestSurface(1, 1);
  return {
    image: createImageResource((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas),
    surface,
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

describe('drawWgpuTextLabel', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    const firstData = wgpuTextLabelRenderer.createData!(state, createTextLabel())!;
    const secondData = wgpuTextLabelRenderer.createData!(state, createTextLabel())!;

    drawWgpuTextLabel(state, makeTextProxy('first', firstData));
    drawWgpuTextLabel(state, makeTextProxy('second', secondData));

    const firstView = firstData as unknown as WgpuTextLabelDataView;
    const secondView = secondData as unknown as WgpuTextLabelDataView;
    const cache = getWgpuRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const firstSurface = firstView.surface;
    const firstImage = firstView.image;
    expect(firstSurface).not.toBe(secondView.surface);
    expect(firstView.image).not.toBe(secondView.image);
    expect(cache.get(firstView.image!)?.texture).not.toBe(cache.get(secondView.image!)?.texture);

    drawWgpuTextLabel(state, makeTextProxy('first', firstData));
    expect((firstData as unknown as WgpuTextLabelDataView).surface).toBe(firstSurface);
    expect((firstData as unknown as WgpuTextLabelDataView).image).toBe(firstImage);
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
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    drawWgpuTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getWgpuRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
    submitWgpuFrame(state);
  });

  it('rasterizes packed run alpha into the canvas color', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuStandardMaterial(state);
    const data = makeTextData();
    const proxy = makeTextProxy('hello', data);
    (proxy.source as ReturnType<typeof createTextLabel>).data.textFormat = { color: 0xff000080 };
    const styles: Array<string | CanvasGradient | CanvasPattern> = [];
    vi.spyOn(data.surface!.context, 'fillText').mockImplementation(() => styles.push(data.surface!.context.fillStyle));

    drawWgpuTextLabel(state, proxy);

    expect(styles).toEqual(['rgba(255, 0, 0, 0.5019607843137255)']);
    submitWgpuFrame(state);
  });

  it('does not re-rasterize when only alpha changes (content version unchanged)', async () => {
    const state = await createWgpuRenderStateForTest();
    setTestHosts(state);
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
    state.canvasHost = createTestCanvasHost((surface) => {
      order.push('surface');
      const view = surface as unknown as { __testImage?: ImageResource };
      if (view.__testImage) expect(cache.has(view.__testImage)).toBe(false);
    });
    state.imageHost = createTestImageHost();
    registerWgpuStandardMaterial(state);
    const data = wgpuTextLabelRenderer.createData!(state, createTextLabel())!;
    drawWgpuTextLabel(state, makeTextProxy('owned', data));
    const dataView = data as unknown as WgpuTextLabelDataView;
    const image = dataView.image!;
    const entry = cache.get(image)!;
    submitWgpuFrame(state);
    vi.spyOn(entry.texture, 'destroy').mockImplementation(() => {
      order.push('texture');
    });

    wgpuTextLabelRenderer.destroyData!(state, data);

    expect(cache.has(image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });
});
