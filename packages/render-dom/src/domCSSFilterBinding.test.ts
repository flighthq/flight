import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject } from '@flighthq/types';

import { enableDOMCSSFilterSupport, getDOMCSSFilter, setDOMCSSFilter } from './domCSSFilterBinding';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  return createDOMRenderState(document.createElement('div'));
}

describe('enableDOMCSSFilterSupport', () => {
  it('installs the CSS filter resolver', () => {
    const state = makeState();
    expect(state.domCSSFilterResolver).toBeNull();
    enableDOMCSSFilterSupport(state);
    expect(state.domCSSFilterResolver).toBe(getDOMCSSFilter);
  });
});

describe('getDOMCSSFilter', () => {
  it('returns the filter bound to a render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(state, node, 'blur(4px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getDOMCSSFilter(renderProxy)).toBe('blur(4px)');
  });

  it('returns undefined for a render node with no binding', () => {
    const state = makeState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(getDOMCSSFilter(renderProxy)).toBeUndefined();
  });
});

describe('setDOMCSSFilter', () => {
  it('stores a filter keyed by the per-state render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(state, node, 'blur(2px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getDOMCSSFilter(renderProxy)).toBe('blur(2px)');
  });

  it('clears the binding when passed null', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(state, node, 'blur(2px)');
    setDOMCSSFilter(state, node, null);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getDOMCSSFilter(renderProxy)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const a = makeState();
    const b = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(a, node, 'blur(2px)');
    expect(getDOMCSSFilter(getOrCreateRenderProxy2D(b, node))).toBeUndefined();
    expect(getDOMCSSFilter(getOrCreateRenderProxy2D(a, node))).toBe('blur(2px)');
  });
});
