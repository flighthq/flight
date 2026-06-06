import { createDisplayObject } from '@flighthq/scene-display';
import type { RenderNodeAdapter } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { createDisplayObjectRenderNode } from './renderNode';
import { adaptRenderNode, getRenderNodeAdapter, setRenderNodeAdapter } from './renderNodeAdapter';
import { createRenderState } from './renderState';

describe('adaptRenderNode', () => {
  it('sets traverseChildren to true when no resolver is attached', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.traverseChildren = false;

    adaptRenderNode(state, source, data);

    expect(data.traverseChildren).toBe(true);
  });

  it('sets traverseChildren from a non-null adapter result', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    const adapter: RenderNodeAdapter = {
      adapt: vi.fn().mockReturnValue(false),
    };
    setRenderNodeAdapter(source, adapter);

    adaptRenderNode(state, source, data);

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
    setRenderNodeAdapter(source, adapter);

    adaptRenderNode(state, source, data);

    expect(data.renderer).toBe(renderer);
  });
});

describe('getRenderNodeAdapter', () => {
  it('returns null when no adapter is set', () => {
    const source = createDisplayObject();
    expect(getRenderNodeAdapter(source)).toBeNull();
  });

  it('returns the adapter after setRenderNodeAdapter', () => {
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(source, adapter);
    expect(getRenderNodeAdapter(source)).toBe(adapter);
    setRenderNodeAdapter(source, null);
  });
});

describe('setRenderNodeAdapter', () => {
  it('sets an adapter for the source', () => {
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(source, adapter);
    expect(getRenderNodeAdapter(source)).toBe(adapter);
    setRenderNodeAdapter(source, null);
  });

  it('removes the adapter when passed null', () => {
    const source = createDisplayObject();
    const adapter: RenderNodeAdapter = { adapt: vi.fn() };
    setRenderNodeAdapter(source, adapter);
    setRenderNodeAdapter(source, null);
    expect(getRenderNodeAdapter(source)).toBeNull();
  });
});
