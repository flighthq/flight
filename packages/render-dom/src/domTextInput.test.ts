import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render';
import { createRichText } from '@flighthq/text';
import { enableTextInput, setTextInputSelection } from '@flighthq/text-input';
import type { RichText } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMRichTextRenderer, drawDOMRichText } from './domRichText';
import { drawDOMTextInputOverlay, enableDOMTextInput } from './domTextInput';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const state = createDOMRenderState(document.createElement('div'));
  registerRenderer(state, RichTextKind, defaultDOMRichTextRenderer);
  return state;
}

function makeFocusedInput(text: string): RichText {
  const node = createRichText({ data: { text, width: 100, height: 40 } });
  enableTextInput(node).focused = true;
  return node;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

describe('drawDOMTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawDOMTextInputOverlay).toBe('function');
  });

  it('appends a caret for the focused collapsed selection', () => {
    enableDOMTextInput();
    const state = makeState();
    const node = makeFocusedInput('hello');
    setTextInputSelection(node, 2, 2);
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy));
    expect(div!.innerHTML).toContain('background:#000000');
  });

  it('appends selection rectangles for the focused expanded selection', () => {
    enableDOMTextInput();
    const state = makeState();
    const node = makeFocusedInput('hello');
    setTextInputSelection(node, 1, 4);
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMRichText(state, renderProxy));
    expect(div!.innerHTML).toContain('background:#0078d7');
  });
});

describe('enableDOMTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableDOMTextInput()).not.toThrow();
  });
});
