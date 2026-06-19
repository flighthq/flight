import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createTextLabel } from '@flighthq/text';
import { TextLabelKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMTextLabelRenderer, drawDOMTextLabel } from './domTextLabel';
import type { DOMRenderStateInternal } from './internal';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, TextLabelKind, defaultDOMTextLabelRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  (state as unknown as DOMRenderStateInternal).domCurrentElement = null;
  drawFn();
  return (state as unknown as DOMRenderStateInternal).domCurrentElement;
}

describe('defaultDOMTextLabelRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDOMTextLabelRenderer.submit).toBe('function');
    expect(typeof defaultDOMTextLabelRenderer.createData).toBe('function');
  });
});

describe('drawDOMTextLabel', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDOMTextLabel(state, renderProxy)).not.toThrow();
  });

  it('produces no element when text is empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMTextLabel(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces a div when text is non-empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDOMTextLabel(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('sets overflow:hidden on the div', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMTextLabel(state, renderProxy))!;
    expect(div.style.overflow).toBe('hidden');
  });

  it('includes the text content in innerHTML', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'world';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDOMTextLabel(state, renderProxy))!;
    expect(div.innerHTML).toContain('world');
  });

  it('reuses the same div across multiple draws', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const firstDiv = drawGetEl(state, () => drawDOMTextLabel(state, renderProxy));
    const secondDiv = drawGetEl(state, () => drawDOMTextLabel(state, renderProxy));

    expect(firstDiv).toBe(secondDiv);
  });
});
