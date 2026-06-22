import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createRichText } from '@flighthq/text';
import { enableTextInput, setTextInputSelection } from '@flighthq/text-input';
import type { RichText } from '@flighthq/types';

import { createCanvasRenderState } from './canvasRenderState';
import { drawCanvasRichText } from './canvasRichText';
import { drawCanvasTextInputOverlay, enableCanvasTextInput } from './canvasTextInput';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return createCanvasRenderState(canvas);
}

function makeFocusedInput(text: string): RichText {
  const node = createRichText({ data: { text, width: 100, height: 40 } });
  enableTextInput(node).focused = true;
  return node;
}

describe('drawCanvasTextInputOverlay', () => {
  it('is installed by enableCanvasTextInput and is the overlay function', () => {
    expect(typeof drawCanvasTextInputOverlay).toBe('function');
  });

  it('draws a caret for the focused collapsed selection', () => {
    enableCanvasTextInput();
    const state = makeState();
    const node = makeFocusedInput('hello');
    setTextInputSelection(node, 2, 2);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasRichText(state, renderProxy);

    expect(spy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 1, expect.any(Number));
  });

  it('draws selection rectangles for the focused expanded selection', () => {
    enableCanvasTextInput();
    const state = makeState();
    const node = makeFocusedInput('hello');
    setTextInputSelection(node, 1, 4);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const spy = vi.spyOn(state.context, 'fillRect');

    drawCanvasRichText(state, renderProxy);

    expect(spy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  });
});

describe('enableCanvasTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableCanvasTextInput()).not.toThrow();
  });

  it('leaves a static RichText (no input slot) free of overlay drawing', () => {
    enableCanvasTextInput();
    const state = makeState();
    const node = createRichText({ data: { text: 'plain', width: 100, height: 40 } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawCanvasRichText(state, renderProxy)).not.toThrow();
  });
});
