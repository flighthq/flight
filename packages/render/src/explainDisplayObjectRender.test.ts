import { createDisplayObject } from '@flighthq/displayobject';
import { addNodeChild } from '@flighthq/node';

import { explainDisplayObjectRender } from './explainDisplayObjectRender';
import { registerRenderer } from './renderer';
import { getRenderProxy2D, prepareDisplayObjectRender } from './renderProxy';
import { createRenderState, getRenderStateRuntime } from './renderState';

function makeRenderer() {
  return { createData: () => ({ tag: 'data' }), submit: vi.fn() } as any;
}

describe('explainDisplayObjectRender', () => {
  it('reports no-renderer for a node whose kind has no registered renderer', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    prepareDisplayObjectRender(state, source);

    const explanation = explainDisplayObjectRender(state, source);

    expect(explanation.hasRenderer).toBe(false);
    expect(explanation.reason).toBe('no-renderer');
    expect(explanation.kind).toBe(source.kind);
  });

  it('reports not-prepared for a registered node that was never prepared', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    registerRenderer(state, source.kind, makeRenderer());

    const explanation = explainDisplayObjectRender(state, source);

    expect(explanation.hasRenderer).toBe(true);
    expect(explanation.prepared).toBe(false);
    expect(explanation.reason).toBe('not-prepared');
  });

  it('reports ok for a prepared, visible, opaque node with a renderer', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    registerRenderer(state, source.kind, makeRenderer());
    prepareDisplayObjectRender(state, source);

    const explanation = explainDisplayObjectRender(state, source);

    expect(explanation.prepared).toBe(true);
    expect(explanation.visible).toBe(true);
    expect(explanation.effectiveAlpha).toBe(1);
    expect(explanation.reason).toBe('ok');
  });

  it('reports not-visible for a hidden node', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    source.visible = false;
    registerRenderer(state, source.kind, makeRenderer());
    prepareDisplayObjectRender(state, source);

    const explanation = explainDisplayObjectRender(state, source);

    expect(explanation.visible).toBe(false);
    expect(explanation.reason).toBe('not-visible');
  });

  it('reports zero-alpha for a visible node whose effective alpha is zero', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    source.alpha = 0;
    registerRenderer(state, source.kind, makeRenderer());
    prepareDisplayObjectRender(state, source);

    const explanation = explainDisplayObjectRender(state, source);

    expect(explanation.visible).toBe(true);
    expect(explanation.effectiveAlpha).toBe(0);
    expect(explanation.reason).toBe('zero-alpha');
  });

  it('reports not-prepared for a descendant of a hidden ancestor, since the prepare walk stops there', () => {
    const state = createRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    parent.visible = false;
    addNodeChild(parent, child);
    registerRenderer(state, child.kind, makeRenderer());
    prepareDisplayObjectRender(state, parent);

    const explanation = explainDisplayObjectRender(state, child);

    expect(explanation.prepared).toBe(false);
    expect(explanation.reason).toBe('not-prepared');
  });

  it('folds a reached ancestor alpha into the child effective alpha', () => {
    const state = createRenderState();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    parent.alpha = 0.5;
    child.alpha = 0.5;
    addNodeChild(parent, child);
    registerRenderer(state, child.kind, makeRenderer());
    prepareDisplayObjectRender(state, parent);

    const explanation = explainDisplayObjectRender(state, child);

    expect(explanation.effectiveAlpha).toBeCloseTo(0.25);
    expect(explanation.reason).toBe('ok');
  });

  it('does not throw or mutate state, and never creates a proxy', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    registerRenderer(state, source.kind, makeRenderer());

    expect(() => explainDisplayObjectRender(state, source)).not.toThrow();
    // Two calls agree and neither materialized a proxy — the query is a pure read.
    const first = explainDisplayObjectRender(state, source);
    const second = explainDisplayObjectRender(state, source);
    expect(second).toEqual(first);
    expect(getRenderProxy2D(state, source)).toBeUndefined();
    expect(getRenderStateRuntime(state).renderProxyMap.get(source)).toBeUndefined();
  });

  it('never throws on a bare edge node with no appearance fields', () => {
    const state = createRenderState();
    const bare = { kind: 'DisplayObject' } as any;

    expect(() => explainDisplayObjectRender(state, bare)).not.toThrow();
  });
});
