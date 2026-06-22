import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createRichText } from '@flighthq/text';
import { enableTextInput } from '@flighthq/textinput';
import { RichTextKind } from '@flighthq/types';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultDomRichTextRenderer, drawDomRichText, registerDomTextInputOverlay } from './domRichText';

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('defaultDomRichTextRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDomRichTextRenderer.submit).toBe('function');
    expect(typeof defaultDomRichTextRenderer.createData).toBe('function');
  });
});

describe('drawDomRichText', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDomRichText(state, renderProxy)).not.toThrow();
  });

  it('produces a div even when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomRichText(state, renderProxy));

    expect(el).not.toBeNull();
  });

  it('clears innerHtml when text is empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    drawDomRichText(state, renderProxy);

    node.data.text = '';
    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy));

    expect(div!.innerHTML).toBe('');
  });

  it('produces a div when text is non-empty', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomRichText(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('sets div width and height from source data', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hello';
    node.data.width = 200;
    node.data.height = 100;
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;
    expect(div.style.width).toBe('200px');
    expect(div.style.height).toBe('100px');
  });

  it('includes the text content in innerHtml', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'world';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;
    expect(div.innerHTML).toContain('world');
  });

  it('renders resolved htmlText spans', () => {
    const state = makeState();
    const node = createRichText();
    node.data.htmlText = '<b>Bold</b><font color="#00ff00">Green</font>';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;
    expect(div.innerHTML).toContain('Bold');
    expect(div.innerHTML).toContain('Green');
    expect(div.innerHTML).toContain('bold');
    expect(div.innerHTML).toContain('#00ff00');
  });

  it('sets backgroundColor when background is enabled', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hi';
    node.data.background = true;
    node.data.backgroundColor = 0xff0000;
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;
    expect(div.style.backgroundColor).not.toBe('');
  });

  it('clears backgroundColor when background is disabled', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'hi';
    node.data.background = false;
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;
    expect(div.style.backgroundColor).toBe('');
  });
});

describe('registerDomTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', () => {
    const overlay = vi.fn();
    registerDomTextInputOverlay(overlay);
    const state = makeState();

    const plain = createRichText({ data: { text: 'x' } });
    drawDomRichText(state, getOrCreateRenderProxy2D(state, plain));
    expect(overlay).not.toHaveBeenCalled();

    const editable = createRichText({ data: { text: 'x' } });
    enableTextInput(editable);
    drawDomRichText(state, getOrCreateRenderProxy2D(state, editable));
    expect(overlay).toHaveBeenCalled();
  });
});
