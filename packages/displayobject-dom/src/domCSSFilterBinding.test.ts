import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject } from '@flighthq/types';

import { enableDomCssFilterSupport, getDomCssFilter, setDomCssFilter } from './domCSSFilterBinding';
import { createDomRenderState } from './domRenderState';

function makeState() {
  return createDomRenderState(document.createElement('div'));
}

describe('enableDomCssFilterSupport', () => {
  it('installs the CSS filter resolver', () => {
    const state = makeState();
    expect(state.domCssFilterResolver).toBeNull();
    enableDomCssFilterSupport(state);
    expect(state.domCssFilterResolver).toBe(getDomCssFilter);
  });
});

describe('getDomCssFilter', () => {
  it('returns the filter bound to a render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDomCssFilter(state, node, 'blur(4px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getDomCssFilter(renderProxy)).toBe('blur(4px)');
  });

  it('returns undefined for a render node with no binding', () => {
    const state = makeState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(getDomCssFilter(renderProxy)).toBeUndefined();
  });
});

describe('setDomCssFilter', () => {
  it('stores a filter keyed by the per-state render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDomCssFilter(state, node, 'blur(2px)');
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getDomCssFilter(renderProxy)).toBe('blur(2px)');
  });

  it('clears the binding when passed null', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDomCssFilter(state, node, 'blur(2px)');
    setDomCssFilter(state, node, null);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getDomCssFilter(renderProxy)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const a = makeState();
    const b = makeState();
    const node = {} as DisplayObject;
    setDomCssFilter(a, node, 'blur(2px)');
    expect(getDomCssFilter(getOrCreateRenderProxy2D(b, node))).toBeUndefined();
    expect(getDomCssFilter(getOrCreateRenderProxy2D(a, node))).toBe('blur(2px)');
  });
});
