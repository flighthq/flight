import {
  createImageResource,
  registerTestImageDimensionResolver,
  unregisterTestImageDimensionResolver,
} from '@flighthq/image/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput, setTextInputSelection } from '@flighthq/textinput/contract';
import type {
  CanvasSurface,
  HostCanvasCapability,
  HostImageCapability,
  RenderProxy2D,
  RichText,
} from '@flighthq/types/contract';

import { createGlRichTextData, drawGlRichText } from './glRichText';
import { createGlState } from './glTestHelper';
import { drawGlTextInputOverlay, enableGlTextInput } from './glTextInput';

// A test that wraps a host handle supplies the host: the resource measures through the registered
// resolver, and clearing after each test keeps this file from covering for another's missing one.
beforeEach(() => {
  registerTestImageDimensionResolver();
});

afterEach(() => {
  unregisterTestImageDimensionResolver();
});

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

function createTestSurface(width: number, height: number): CanvasSurface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { context: canvas.getContext('2d')! } as unknown as CanvasSurface;
}

function createTestCanvasHost(): HostCanvasCapability {
  return {
    acquire: () => null,
    create: () => null,
    createSurface: createTestSurface,
    destroySurface() {},
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

describe('drawGlTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawGlTextInputOverlay).toBe('function');
  });

  it('rasterizes a focused collapsed selection without throwing', () => {
    enableGlTextInput();
    const { state, gl } = createGlState();
    state.canvasHost = createTestCanvasHost();
    state.imageHost = createTestImageHost();
    const renderProxy = makeFocusedInputProxy(state);
    setTextInputSelection(renderProxy.source as RichText, 2, 2);

    expect(() => drawGlRichText(state, renderProxy)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('rasterizes a focused expanded selection without throwing', () => {
    enableGlTextInput();
    const { state, gl } = createGlState();
    state.canvasHost = createTestCanvasHost();
    state.imageHost = createTestImageHost();
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
