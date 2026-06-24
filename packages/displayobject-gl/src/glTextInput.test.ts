import { createRichText } from '@flighthq/text';
import { enableTextInput, setTextInputSelection } from '@flighthq/textinput';
import type { RenderProxy2D, RichText } from '@flighthq/types';

import { drawGlRichText } from './glRichText';
import { makeGlState } from './glTestHelper';
import { drawGlTextInputOverlay, enableGlTextInput } from './glTextInput';

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

describe('drawGlTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawGlTextInputOverlay).toBe('function');
  });

  it('rasterizes a focused collapsed selection without throwing', () => {
    enableGlTextInput();
    const { state, gl } = makeGlState();
    const renderProxy = makeFocusedInputProxy();
    setTextInputSelection(renderProxy.source as RichText, 2, 2);

    expect(() => drawGlRichText(state, renderProxy)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('rasterizes a focused expanded selection without throwing', () => {
    enableGlTextInput();
    const { state, gl } = makeGlState();
    const renderProxy = makeFocusedInputProxy();
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
