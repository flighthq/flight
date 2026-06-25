import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { BitmapFilter, DisplayObject } from '@flighthq/types';

import {
  enableDomCssFilterSupport,
  getDomCssFilter,
  hasDomCssFilterEquivalent,
  setDomCssFilter,
} from './domCSSFilterBinding';
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

describe('hasDomCssFilterEquivalent', () => {
  it('returns true for BlurFilter', () => {
    const filter = { kind: 'BlurFilter' } as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(true);
  });

  it('returns true for DropShadowFilter', () => {
    const filter = { kind: 'DropShadowFilter' } as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(true);
  });

  it('returns true for OuterGlowFilter (approximated as drop-shadow with 0 offset)', () => {
    const filter = { kind: 'OuterGlowFilter' } as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(true);
  });

  it('returns false for ConvolutionFilter', () => {
    const filter = { kind: 'ConvolutionFilter' } as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(false);
  });

  it('returns false for DisplacementMapFilter', () => {
    const filter = { kind: 'DisplacementMapFilter' } as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(false);
  });

  it('returns false for ColorMatrixFilter (use getDomSvgColorMatrixFilter for SVG-filter path)', () => {
    const filter = { kind: 'ColorMatrixFilter' } as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(false);
  });

  it('returns false for an unknown filter kind', () => {
    const filter = { kind: 'UnknownFilter' } as unknown as BitmapFilter;
    expect(hasDomCssFilterEquivalent(filter)).toBe(false);
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
