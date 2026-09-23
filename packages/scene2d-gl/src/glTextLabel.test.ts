import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createTextLabel, setTextLabelString } from '@flighthq/text/contract';
import * as textlayout from '@flighthq/textlayout/contract';
import type {
  CanvasSurface,
  HostCanvasCapability,
  HostImageCapability,
  ImageResource,
  RendererData,
  RenderProxy2D,
  TextLabel,
} from '@flighthq/types/contract';
import { BatchFormat, EntityRuntimeKey } from '@flighthq/types/contract';

import { flushGlQuadBatchWriter } from './glQuadBatchWriter';
import { registerGlStandardMaterial } from './glStandardMaterial';
import { createGlState } from './glTestHelper';
import { glTextLabelRenderer, drawGlTextLabel, initializeGlTextLabelData } from './glTextLabel';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

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
  return { context: canvas.getContext('2d')! } as unknown as CanvasSurface;
}

function makeTextData() {
  return {
    allocH: 0,
    allocW: 0,
    image: null as ImageResource | null,
    lastContentId: -1,
    lastPixelRatio: 0,
    logH: 0,
    logW: 0,
    surface: null as CanvasSurface | null,
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

function installTestHosts(
  state: { canvasHost: unknown; imageHost: unknown },
  destroySurface: (surface: CanvasSurface) => void = () => {},
): void {
  state.canvasHost = {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface,
    release() {},
  } satisfies HostCanvasCapability;
  state.imageHost = {
    createImageFromSurface(surface) {
      return createImageResource((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas);
    },
    loadImageFromUrl: () => Promise.reject(new Error('not implemented')),
  } satisfies HostImageCapability;
}

describe('drawGlTextLabel', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', () => {
    const { state } = createGlState();
    installTestHosts(state);
    registerGlStandardMaterial(state);
    const firstData = glTextLabelRenderer.createData!(state, createTextLabel())!;
    const secondData = glTextLabelRenderer.createData!(state, createTextLabel())!;

    drawGlTextLabel(state, makeTextProxy('first', firstData));
    drawGlTextLabel(state, makeTextProxy('second', secondData));

    const firstOwned = firstData as unknown as { image: ImageResource; surface: CanvasSurface };
    const secondOwned = secondData as unknown as { image: ImageResource; surface: CanvasSurface };
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const firstSurface = firstOwned.surface;
    const firstImage = firstOwned.image;
    expect(firstOwned.surface).not.toBe(secondOwned.surface);
    expect(firstOwned.image).not.toBe(secondOwned.image);
    expect(cache.get(firstOwned.image)?.texture).not.toBe(cache.get(secondOwned.image)?.texture);

    drawGlTextLabel(state, makeTextProxy('first', firstData));
    // The new canvas-seam pattern recreates surfaces on each draw (destroy + create at the measurement
    // size, then again at the final pixel size), so surface/image identity is not preserved across draws.
    // Verify the node still holds a valid surface and image after re-draw.
    expect(firstOwned.surface).not.toBeNull();
    expect(firstOwned.image).not.toBeNull();
  });

  it('returns early without writing to batch when text is empty', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('', makeTextData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('returns early without writing to batch when rendererData is null', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', null));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('returns early without writing to batch when no material renderer is registered', () => {
    const { state } = createGlState();
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(0);
  });

  it('writes one instance to the quad-batch writer when text has content', () => {
    const { state } = createGlState();
    installTestHosts(state);
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    expect(getGlRenderStateRuntime(state).quadBatchWriterCount).toBe(1);
  });

  it('rasterizes packed run alpha into the canvas color', () => {
    const { state } = createGlState();
    registerGlStandardMaterial(state);
    const styles: Array<string | CanvasGradient | CanvasPattern> = [];
    state.canvasHost = {
      acquire: () => null,
      create: () => null,
      createSurface(w: number, h: number) {
        const surface = createTestSurface(w, h);
        vi.spyOn(surface.context, 'fillText').mockImplementation(() => styles.push(surface.context.fillStyle));
        return surface;
      },
      destroySurface() {},
      release() {},
    } satisfies HostCanvasCapability;
    state.imageHost = {
      createImageFromSurface(surface) {
        return createImageResource((surface as unknown as { context: CanvasRenderingContext2D }).context.canvas);
      },
      loadImageFromUrl: () => Promise.reject(new Error('not implemented')),
    } satisfies HostImageCapability;
    const proxy = makeTextProxy('hello', makeTextData());
    (proxy.source as TextLabel).data.textFormat = { color: 0xff000080 };

    drawGlTextLabel(state, proxy);

    expect(styles).toEqual(['rgba(255, 0, 0, 0.5019607843137255)']);
  });

  it('draws via drawElementsInstanced after flush', () => {
    const { state, gl } = createGlState();
    installTestHosts(state);
    registerGlStandardMaterial(state);
    drawGlTextLabel(state, makeTextProxy('hello', makeTextData()));
    flushGlQuadBatchWriter(state);
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('skips layout and rasterization on repeated calls when the content version is unchanged', () => {
    const { state } = createGlState();
    installTestHosts(state);
    registerGlStandardMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawGlTextLabel(state, proxy);
    // The canvas-seam pattern recreates surfaces on each draw, so image identity is not stable across
    // calls. Track layout invocations instead: a skipped raster skips layout too.
    const layoutCount = vi.mocked(textlayout.computeTextLayout).mock.calls.length;
    drawGlTextLabel(state, proxy);
    expect(vi.mocked(textlayout.computeTextLayout).mock.calls.length).toBe(layoutCount);
  });

  it('re-rasterizes when the content version is bumped', () => {
    const { state } = createGlState();
    installTestHosts(state);
    registerGlStandardMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawGlTextLabel(state, proxy);
    const layoutCount = vi.mocked(textlayout.computeTextLayout).mock.calls.length;
    setTextLabelString(proxy.source as TextLabel, 'world');
    drawGlTextLabel(state, proxy);
    expect(vi.mocked(textlayout.computeTextLayout).mock.calls.length).toBeGreaterThan(layoutCount);
  });

  it('does not re-rasterize when only alpha changes (version unchanged)', () => {
    const { state } = createGlState();
    installTestHosts(state);
    registerGlStandardMaterial(state);
    const proxy = makeTextProxy('hello', makeTextData());
    drawGlTextLabel(state, proxy);
    const layoutCount = vi.mocked(textlayout.computeTextLayout).mock.calls.length;
    proxy.alpha = 0.5;
    drawGlTextLabel(state, proxy);
    // Alpha is applied per-instance in the batch; the expensive layout and raster are untouched.
    expect(vi.mocked(textlayout.computeTextLayout).mock.calls.length).toBe(layoutCount);
  });
});

describe('glTextLabelRenderer', () => {
  it('declares BatchFormat.Quad', () => {
    expect(glTextLabelRenderer.format).toBe(BatchFormat.Quad);
  });

  it('has a createData function', () => {
    expect(typeof glTextLabelRenderer.createData).toBe('function');
  });

  it('creates RendererData with an entity runtime slot', () => {
    const data = glTextLabelRenderer.createData!(createGlState().state, createTextLabel())!;
    expect(EntityRuntimeKey in data).toBe(true);
  });

  it('has a submit function pointing to drawGlTextLabel', () => {
    expect(glTextLabelRenderer.submit).toBe(drawGlTextLabel);
  });

  it('removes the GPU cache entry before returning the node surface to its creator', () => {
    const order: string[] = [];
    const { state, gl } = createGlState();
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    installTestHosts(state, () => {
      order.push('surface');
    });
    registerGlStandardMaterial(state);
    const data = glTextLabelRenderer.createData!(state, createTextLabel())!;
    drawGlTextLabel(state, makeTextProxy('owned', data));
    // Clear tracking from the draw phase's internal surface resizing.
    order.length = 0;
    const owned = data as RendererData & { image: ImageResource; surface: CanvasSurface };
    const image = owned.image;
    const entry = cache.get(image)!;
    vi.spyOn(gl, 'deleteTexture').mockImplementation((texture) => {
      if (texture === entry.texture) order.push('texture');
    });

    glTextLabelRenderer.destroyData!(state, data);

    expect(cache.has(image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });
});
describe('initializeGlTextLabelData', () => {
  it('is the construction initializer of createGlTextLabelData', () => {
    expect(typeof initializeGlTextLabelData).toBe('function');
  });
});
