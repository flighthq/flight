import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { createTextLabel } from '@flighthq/text';
import { TextLabelKind } from '@flighthq/types';

import { createDomRenderState, getDomRenderStateRuntime } from './domRenderState';
import { defaultDomTextLabelRenderer, drawDomTextLabel } from './domTextLabel';

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
  return state;
}

function drawGetEl(state: ReturnType<typeof makeState>, drawFn: () => void): HTMLElement | null {
  getDomRenderStateRuntime(state).domCurrentElement = null;
  drawFn();
  return getDomRenderStateRuntime(state).domCurrentElement;
}

describe('defaultDomTextLabelRenderer', () => {
  it('has submit, and createData', () => {
    expect(typeof defaultDomTextLabelRenderer.submit).toBe('function');
    expect(typeof defaultDomTextLabelRenderer.createData).toBe('function');
  });
});

describe('drawDomTextLabel', () => {
  it('does not throw when text is empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(() => drawDomTextLabel(state, renderProxy)).not.toThrow();
  });

  it('produces no element when text is empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = '';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomTextLabel(state, renderProxy));

    expect(el).toBeNull();
  });

  it('produces a div when text is non-empty', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const el = drawGetEl(state, () => drawDomTextLabel(state, renderProxy));

    expect(el).not.toBeNull();
    expect(el!.tagName).toBe('DIV');
  });

  it('sets overflow:hidden on the div', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomTextLabel(state, renderProxy))!;
    expect(div.style.overflow).toBe('hidden');
  });

  it('includes the text content in innerHtml', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'world';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const div = drawGetEl(state, () => drawDomTextLabel(state, renderProxy))!;
    expect(div.innerHTML).toContain('world');
  });

  it('reuses the same div across multiple draws', () => {
    const state = makeState();
    const node = createTextLabel();
    node.data.text = 'hello';
    const renderProxy = getOrCreateRenderProxy2D(state, node);

    const firstDiv = drawGetEl(state, () => drawDomTextLabel(state, renderProxy));
    const secondDiv = drawGetEl(state, () => drawDomTextLabel(state, renderProxy));

    expect(firstDiv).toBe(secondDiv);
  });
});
