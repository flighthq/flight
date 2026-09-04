import { createImageResource } from '@flighthq/image/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput, setTextInputSelection } from '@flighthq/textinput/contract';
import type { Raster2DSurface, RenderProxy2D, RichText } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createGlRichTextData, drawGlRichText } from './glRichText';
import { createGlState } from './glTestHelper';
import { drawGlTextInputOverlay, enableGlTextInput } from './glTextInput';

function makeFocusedInputProxy(state: Parameters<typeof createGlRichTextData>[0]): RenderProxy2D {
  const node = createRichText({ data: { height: 40, text: 'hello', width: 100 } });
  enableTextInput(node).focused = true;
  return {
    source: node,
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: createGlRichTextData(state, node),
  } as unknown as RenderProxy2D;
}

function createTestRaster2DSurface(width: number, height: number): Raster2DSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
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
    context: canvas.getContext('2d')!,
    image: createImageResource(canvas),
  };
}

describe('drawGlTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawGlTextInputOverlay).toBe('function');
  });

  it('rasterizes a focused collapsed selection without throwing', () => {
    enableGlTextInput();
    const { state, gl } = createGlState();
    state.raster2DSurfaceProvider = {
      [EntityRuntimeKey]: undefined,
      createRaster2DSurface: createTestRaster2DSurface,
      destroyRaster2DSurface() {},
    };
    const renderProxy = makeFocusedInputProxy(state);
    setTextInputSelection(renderProxy.source as RichText, 2, 2);

    expect(() => drawGlRichText(state, renderProxy)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('rasterizes a focused expanded selection without throwing', () => {
    enableGlTextInput();
    const { state, gl } = createGlState();
    state.raster2DSurfaceProvider = {
      [EntityRuntimeKey]: undefined,
      createRaster2DSurface: createTestRaster2DSurface,
      destroyRaster2DSurface() {},
    };
    const renderProxy = makeFocusedInputProxy(state);
    setTextInputSelection(renderProxy.source as RichText, 1, 4);

    expect(() => drawGlRichText(state, renderProxy)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('enableGlTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableGlTextInput()).not.toThrow();
  });
});
