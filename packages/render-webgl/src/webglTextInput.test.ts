import { createRichText } from '@flighthq/text';
import { enableTextInput, setTextInputSelection } from '@flighthq/text-input';
import type { RenderProxy2D, RichText } from '@flighthq/types';

import { drawWebGLRichText } from './webglRichText';
import { makeWebGLState } from './webglTestHelper';
import { drawWebGLTextInputOverlay, enableWebGLTextInput } from './webglTextInput';

function makeFocusedInputProxy(): RenderProxy2D {
  const node = createRichText({ data: { height: 40, text: 'hello', width: 100 } });
  enableTextInput(node).focused = true;
  return {
    source: node,
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: { texture: null },
  } as unknown as RenderProxy2D;
}

describe('drawWebGLTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawWebGLTextInputOverlay).toBe('function');
  });

  it('rasterizes a focused collapsed selection without throwing', () => {
    enableWebGLTextInput();
    const { state, gl } = makeWebGLState();
    const renderProxy = makeFocusedInputProxy();
    setTextInputSelection(renderProxy.source as RichText, 2, 2);

    expect(() => drawWebGLRichText(state, renderProxy)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('rasterizes a focused expanded selection without throwing', () => {
    enableWebGLTextInput();
    const { state, gl } = makeWebGLState();
    const renderProxy = makeFocusedInputProxy();
    setTextInputSelection(renderProxy.source as RichText, 1, 4);

    expect(() => drawWebGLRichText(state, renderProxy)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('enableWebGLTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableWebGLTextInput()).not.toThrow();
  });
});
