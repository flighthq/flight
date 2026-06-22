import { getOrCreateRenderProxy2D, registerRenderer } from '@flighthq/render';
import { createRichText } from '@flighthq/text';
import { enableTextInput, setTextInputSelection } from '@flighthq/textinput';
import type { RichText } from '@flighthq/types';
import { RichTextKind } from '@flighthq/types';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultDomRichTextRenderer, drawDomRichText } from './domRichText';
import { drawDomTextInputOverlay, enableDomTextInput } from './domTextInput';

function makeState() {
  const state = createDomRenderState(document.createElement('div'));
  registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
  return state;
}

function makeFocusedInput(text: string): RichText {
  const node = createRichText({ data: { text, width: 100, height: 40 } });
  enableTextInput(node).focused = true;
  return node;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('drawDomTextInputOverlay', () => {
  it('is the installed overlay function', () => {
    expect(typeof drawDomTextInputOverlay).toBe('function');
  });

  it('appends a caret for the focused collapsed selection', () => {
    enableDomTextInput();
    const state = makeState();
    const node = makeFocusedInput('hello');
    setTextInputSelection(node, 2, 2);
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy));
    expect(div!.innerHTML).toContain('background:#000000');
  });

  it('appends selection rectangles for the focused expanded selection', () => {
    enableDomTextInput();
    const state = makeState();
    const node = makeFocusedInput('hello');
    setTextInputSelection(node, 1, 4);
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy));
    expect(div!.innerHTML).toContain('background:#0078d7');
  });
});

describe('enableDomTextInput', () => {
  it('installs the overlay without throwing', () => {
    expect(() => enableDomTextInput()).not.toThrow();
  });
});
