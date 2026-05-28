import { mat3x2SetTo } from '@flighthq/geometry';
import { getDisplayObjectRenderNode } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { BlendMode } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { applyDOMStyle, initDOMElement } from './domStyle';

function makeState() {
  const container = document.createElement('div');
  return createDOMRenderState(container);
}

describe('initDOMElement', () => {
  it('sets position to absolute', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.position).toBe('absolute');
  });

  it('sets left and top to 0', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');
  });

  it('sets transformOrigin to "0 0"', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.transformOrigin).toBe('0 0');
  });

  it('sets pointerEvents to none', () => {
    const el = document.createElement('div');
    initDOMElement(el);
    expect(el.style.pointerEvents).toBe('none');
  });
});

describe('applyDOMStyle', () => {
  it('applies the world transform as a CSS matrix', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getDisplayObjectRenderNode(state, obj);
    mat3x2SetTo(node.transform2D, 1, 0, 0, 1, 10, 20);

    applyDOMStyle(state, el, node);

    expect(el.style.transform).toContain('matrix(1,0,0,1,10,20)');
  });

  it('sets opacity when alpha is less than 1', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getDisplayObjectRenderNode(state, obj);
    node.alpha = 0.5;

    applyDOMStyle(state, el, node);

    expect(el.style.opacity).toBe('0.5');
  });

  it('clears opacity when alpha is 1', () => {
    const state = makeState();
    const el = document.createElement('div');
    el.style.opacity = '0.5';
    const obj = createDisplayObject();
    const node = getDisplayObjectRenderNode(state, obj);
    node.alpha = 1;

    applyDOMStyle(state, el, node);

    expect(el.style.opacity).toBe('');
  });

  it('sets mixBlendMode for non-default blend mode', () => {
    const state = makeState();
    const el = document.createElement('div');
    const obj = createDisplayObject();
    const node = getDisplayObjectRenderNode(state, obj);
    node.blendMode = BlendMode.Multiply;

    applyDOMStyle(state, el, node);

    expect(el.style.mixBlendMode).toBe('multiply');
  });
});
