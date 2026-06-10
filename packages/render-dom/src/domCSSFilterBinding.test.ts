import { getOrCreateDisplayObjectRenderNode, hasRenderFeatures } from '@flighthq/render';
import { type DisplayObject, RenderFeatures } from '@flighthq/types';

import { enableDOMCSSFilterSupport, getDOMCSSFilter, setDOMCSSFilter } from './domCSSFilterBinding';
import { createDOMRenderState } from './domRenderState';

function makeState() {
  return createDOMRenderState(document.createElement('div'));
}

describe('enableDOMCSSFilterSupport', () => {
  it('enables the CSSFilter render feature', () => {
    const state = makeState();
    enableDOMCSSFilterSupport(state);
    expect(hasRenderFeatures(state, RenderFeatures.CSSFilter)).toBe(true);
  });
});

describe('getDOMCSSFilter', () => {
  it('returns the filter bound to a render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(state, node, 'blur(4px)');
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(getDOMCSSFilter(renderNode)).toBe('blur(4px)');
  });

  it('returns undefined for a render node with no binding', () => {
    const state = makeState();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, {} as DisplayObject);
    expect(getDOMCSSFilter(renderNode)).toBeUndefined();
  });
});

describe('setDOMCSSFilter', () => {
  it('stores a filter keyed by the per-state render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(state, node, 'blur(2px)');
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(getDOMCSSFilter(renderNode)).toBe('blur(2px)');
  });

  it('clears the binding when passed null', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(state, node, 'blur(2px)');
    setDOMCSSFilter(state, node, null);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(getDOMCSSFilter(renderNode)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const a = makeState();
    const b = makeState();
    const node = {} as DisplayObject;
    setDOMCSSFilter(a, node, 'blur(2px)');
    expect(getDOMCSSFilter(getOrCreateDisplayObjectRenderNode(b, node))).toBeUndefined();
    expect(getDOMCSSFilter(getOrCreateDisplayObjectRenderNode(a, node))).toBe('blur(2px)');
  });
});
