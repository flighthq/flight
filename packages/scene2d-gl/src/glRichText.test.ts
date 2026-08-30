import { createImageResource } from '@flighthq/image/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { resetRaster2DSurfaceProviderForTest, setRaster2DSurfaceProvider } from '@flighthq/render/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import type { Raster2DSurface, RendererData, RenderProxy2D, RichText } from '@flighthq/types/contract';

import {
  createGlRichTextData,
  defaultGlRichTextRenderer,
  destroyGlRichTextData,
  drawGlRichText,
  drawGlRichTextWithOverlay,
  registerGlTextInputOverlay,
} from './glRichText';
import { createGlState } from './glTestHelper';

function makeRichTextNode(rendererData: unknown = { surface: createTestRaster2DSurface(1, 1) }): RenderProxy2D {
  const richText = createRichText();
  return {
    source: richText,
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData,
  } as unknown as RenderProxy2D;
}

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

afterEach(() => {
  resetRaster2DSurfaceProviderForTest();
});

describe('createGlRichTextData', () => {
  it('starts without a raster surface until the node first draws', () => {
    const { state } = createGlState();
    const data = createGlRichTextData(state, createRichText()) as unknown as { surface: Raster2DSurface | null };
    expect(data.surface).toBeNull();
  });
});

describe('defaultGlRichTextRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultGlRichTextRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawGlRichText', () => {
    expect(defaultGlRichTextRenderer.submit).toBe(drawGlRichText);
  });
});

describe('destroyGlRichTextData', () => {
  it('removes the GPU cache entry before returning the node surface to its creator', () => {
    const order: string[] = [];
    const { state, gl } = createGlState();
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    installTestRaster2DSurfaceProvider((surface) => {
      order.push('surface');
      expect(cache.has(surface.image)).toBe(false);
    });
    const data = createGlRichTextData(state, createRichText());
    const proxy = makeRichTextNode(data);
    (proxy.source as RichText).data.text = 'owned';
    drawGlRichText(state, proxy);
    const surface = (data as unknown as { surface: Raster2DSurface }).surface;
    const entry = cache.get(surface.image)!;
    vi.spyOn(gl, 'deleteTexture').mockImplementation((texture) => {
      if (texture === entry.texture) order.push('texture');
    });

    destroyGlRichTextData(state, data);

    expect(cache.has(surface.image)).toBe(false);
    expect(order).toEqual(['texture', 'surface']);
  });

  it('is a no-op when no surface was allocated', () => {
    const { state, gl } = createGlState();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlRichTextData(state, { surface: null } as unknown as RendererData);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('drawGlRichText', () => {
  it('keeps different text nodes on distinct surfaces and GPU textures in one frame', () => {
    installTestRaster2DSurfaceProvider();
    const { state } = createGlState();
    const firstData = createGlRichTextData(state, createRichText());
    const secondData = createGlRichTextData(state, createRichText());
    const first = makeRichTextNode(firstData);
    const second = makeRichTextNode(secondData);
    (first.source as RichText).data.text = 'first';
    (second.source as RichText).data.text = 'second';

    drawGlRichText(state, first);
    drawGlRichText(state, second);

    const firstOwned = firstData as unknown as { surface: Raster2DSurface };
    const secondOwned = secondData as unknown as { surface: Raster2DSurface };
    const cache = getGlRenderStateRuntime(state).context.textureSourcePremultipliedTextureCache;
    const firstSurface = firstOwned.surface;
    const firstImage = firstSurface.image;
    expect(firstOwned.surface).not.toBe(secondOwned.surface);
    expect(firstOwned.surface.image).not.toBe(secondOwned.surface.image);
    expect(cache.get(firstOwned.surface.image)?.texture).not.toBe(cache.get(secondOwned.surface.image)?.texture);

    drawGlRichText(state, first);
    expect(firstOwned.surface).toBe(firstSurface);
    expect(firstOwned.surface.image).toBe(firstImage);
  });

  it('binds the active bitmap shader when drawing rich text', () => {
    const { state } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';

    // The default bitmap shader is compiled on FIRST USE and is null until then, so this first draw is
    // what brings it into existence — spying before it would attach to nothing. A `!` here would only
    // silence the type error announcing that, which is how this test previously passed typecheck and
    // failed at runtime. Draw once to force the compile, then spy on the real object and draw again.
    drawGlRichText(state, renderProxy);
    const shader = getGlRenderStateRuntime(state).defaultBitmapShader;
    expect(shader).not.toBeNull();

    const bindSpy = vi.spyOn(shader!, 'bind');
    drawGlRichText(state, renderProxy);

    expect(bindSpy).toHaveBeenCalledWith(state.gl, state, renderProxy);
  });

  it('returns early without drawing when text and chrome are empty', () => {
    const { state, gl } = createGlState();
    drawGlRichText(state, makeRichTextNode());
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws when text is non-empty', () => {
    const { state, gl } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';
    drawGlRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws resolved multi-format spans', () => {
    const { state, gl } = createGlState();
    const renderProxy = makeRichTextNode();
    const node = renderProxy.source as RichText;
    node.data.text = 'BoldGreen';
    node.data.textFormatRanges = [
      { start: 0, end: 4, format: { bold: true } },
      { start: 4, end: 9, format: { color: 0x00ff00ff } },
    ];
    drawGlRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws field chrome even when text is empty', () => {
    const { state, gl } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.background = true;
    drawGlRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('drawGlRichTextWithOverlay', () => {
  it('runs an optional canvas overlay after layout', () => {
    const { state } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';
    const overlay = vi.fn();

    drawGlRichTextWithOverlay(state, renderProxy, overlay);

    expect(overlay).toHaveBeenCalled();
  });
});

describe('registerGlTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', () => {
    const overlay = vi.fn();
    registerGlTextInputOverlay(overlay);
    const { state } = createGlState();

    const plain = makeRichTextNode();
    (plain.source as RichText).data.text = 'x';
    drawGlRichText(state, plain);
    expect(overlay).not.toHaveBeenCalled();

    const editable = makeRichTextNode();
    (editable.source as RichText).data.text = 'x';
    enableTextInput(editable.source as RichText);
    drawGlRichText(state, editable);
    expect(overlay).toHaveBeenCalled();
  });
});
