import { registerRenderer } from '@flighthq/render/contract';
import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import { RichTextKind } from '@flighthq/types/contract';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import {
  defaultDomRichTextRenderer,
  drawDomRichText,
  drawDomRichTextMask,
  registerDomTextInputOverlay,
} from './domRichText';

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

  it('renders resolved multi-format spans', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'BoldGreen';
    node.data.textFormatRanges = [
      { start: 0, end: 4, format: { bold: true } },
      { start: 4, end: 9, format: { color: 0x00ff00ff } },
    ];
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;
    expect(div.innerHTML).toContain('Bold');
    expect(div.innerHTML).toContain('Green');
    expect(div.innerHTML).toContain('bold');
    expect(div.innerHTML).toContain('rgba(0,255,0,1)');
  });

  it('emits packed run alpha in the CSS color', () => {
    const state = makeState();
    const node = createRichText();
    node.data.text = 'alpha';
    node.data.textFormatRanges = [{ start: 0, end: 5, format: { color: 0x00ff0080 } }];
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomRichText(state, renderProxy))!;

    expect(div.innerHTML).toContain('rgba(0,255,0,0.5019607843137255)');
  });

  it('renders an uninterrupted underline like the raster text backends', () => {
    const state = makeState();
    const node = createRichText({
      data: {
        text: 'underlined',
        textFormatRanges: [{ end: 10, format: { underline: true }, start: 0 }],
      },
    });

    const div = drawGetEl(state, () => drawDomRichText(state, getOrCreateRenderProxy2D(state, node)))!;

    expect(div.innerHTML).toContain('text-decoration:underline');
    expect(div.innerHTML).toContain('text-decoration-skip-ink:none');
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

describe('drawDomRichTextMask', () => {
  it('does not throw and produces a DOM element', () => {
    const state = makeState();
    const node = createRichText({ data: { text: 'mask text' } });
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    const el = drawGetEl(state, () => drawDomRichTextMask(state, renderProxy));
    expect(el).not.toBeNull();
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
