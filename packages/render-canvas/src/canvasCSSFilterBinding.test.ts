import { getOrCreateRenderNode2D, hasRenderFeatures } from '@flighthq/render';
import { type DisplayObject, RenderFeatures } from '@flighthq/types';

import {
  enableCanvasCSSFilterSupport,
  getCanvasCSSFilter,
  resolveCanvasCSSFilter,
  setCanvasCSSFilter,
} from './canvasCSSFilterBinding';
import { createCanvasRenderState } from './canvasRenderState';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  return createCanvasRenderState(canvas);
}

describe('enableCanvasCSSFilterSupport', () => {
  it('enables the CSSFilter render feature', () => {
    const state = makeState();
    enableCanvasCSSFilterSupport(state);
    expect(hasRenderFeatures(state, RenderFeatures.CSSFilter)).toBe(true);
  });
});

describe('getCanvasCSSFilter', () => {
  it('returns the filter bound to a render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(4px)');
    const renderNode = getOrCreateRenderNode2D(state, node);
    expect(getCanvasCSSFilter(renderNode)).toBe('blur(4px)');
  });

  it('returns undefined for a render node with no binding', () => {
    const state = makeState();
    const renderNode = getOrCreateRenderNode2D(state, {} as DisplayObject);
    expect(getCanvasCSSFilter(renderNode)).toBeUndefined();
  });
});

describe('resolveCanvasCSSFilter', () => {
  it('returns null when support is not enabled, even with a binding', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(2px)');
    const renderNode = getOrCreateRenderNode2D(state, node);
    expect(resolveCanvasCSSFilter(state, renderNode)).toBeNull();
  });

  it('returns null when support is enabled but no filter is set', () => {
    const state = makeState();
    enableCanvasCSSFilterSupport(state);
    const renderNode = getOrCreateRenderNode2D(state, {} as DisplayObject);
    expect(resolveCanvasCSSFilter(state, renderNode)).toBeNull();
  });

  it('returns the bound filter when support is enabled', () => {
    const state = makeState();
    enableCanvasCSSFilterSupport(state);
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'grayscale(1)');
    const renderNode = getOrCreateRenderNode2D(state, node);
    expect(resolveCanvasCSSFilter(state, renderNode)).toBe('grayscale(1)');
  });
});

describe('setCanvasCSSFilter', () => {
  it('stores a filter keyed by the per-state render node', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(2px)');
    const renderNode = getOrCreateRenderNode2D(state, node);
    expect(getCanvasCSSFilter(renderNode)).toBe('blur(2px)');
  });

  it('clears the binding when passed null', () => {
    const state = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(state, node, 'blur(2px)');
    setCanvasCSSFilter(state, node, null);
    const renderNode = getOrCreateRenderNode2D(state, node);
    expect(getCanvasCSSFilter(renderNode)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const a = makeState();
    const b = makeState();
    const node = {} as DisplayObject;
    setCanvasCSSFilter(a, node, 'blur(2px)');
    expect(getCanvasCSSFilter(getOrCreateRenderNode2D(b, node))).toBeUndefined();
    expect(getCanvasCSSFilter(getOrCreateRenderNode2D(a, node))).toBe('blur(2px)');
  });
});
