import { createDisplayObject } from '@flighthq/displayobject';
import type { RenderNodeAdapter } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { createDisplayObjectRenderNode } from './renderNode';
import { applyRenderNodeAdapter, getRenderNodeAdapter, setRenderNodeAdapter } from './renderNodeAdapter';
import { createRenderState } from './renderState';

describe('applyRenderNodeAdapter', () => {
  it('sets traverseChildren to true when no resolver is attached', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.traverseChildren = false;

    applyRenderNodeAdapter(state, source, data);

    expect(data.traverseChildren).toBe(true);
  });

  it('sets traverseChildren from a non-null adapter result', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    const adapter: RenderNodeAdapter = {
      adapt: vi.fn().mockReturnValue(false),
    };
    setRenderNodeAdapter(state, source, adapter);

    applyRenderNodeAdapter(state, source, data);

    expect(data.traverseChildren).toBe(false);
  });

  it('syncs renderer when the adapter changes the node kind', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    const kind = Symbol('Adapted');
    const renderer = { createData: () => null, draw: vi.fn() };
    registerRenderer(state, kind, renderer);
    const adapter: RenderNodeAdapter = {
      adapt: (_state, _source, node) => {
        node.kind = kind;
        return true;
      },
    };
    setRenderNodeAdapter(state, source, adapter);

    applyRenderNodeAdapter(state, source, data);

    expect(data.renderer).toBe(renderer);
  });
});

describe('getRenderNodeAdapter', () => {
  it('returns null when no adapter is set', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    expect(getRenderNodeAdapter(state, source)).toBeNull();
  });

  it('returns the adapter after setRenderNodeAdapter', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(state, source, adapter);
    expect(getRenderNodeAdapter(state, source)).toBe(adapter);
    setRenderNodeAdapter(state, source, null);
  });
});

describe('setRenderNodeAdapter', () => {
  it('sets an adapter for the source', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(state, source, adapter);
    expect(getRenderNodeAdapter(state, source)).toBe(adapter);
    setRenderNodeAdapter(state, source, null);
  });

  it('isolates adapters between render states', () => {
    const stateA = createRenderState();
    const stateB = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(stateA, source, adapter);
    expect(getRenderNodeAdapter(stateA, source)).toBe(adapter);
    expect(getRenderNodeAdapter(stateB, source)).toBeNull();
  });

  it('removes the adapter when passed null', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(state, source, adapter);
    setRenderNodeAdapter(state, source, null);
    expect(getRenderNodeAdapter(state, source)).toBeNull();
  });
});
