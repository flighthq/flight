import { createMatrix } from '@flighthq/geometry';
import {
  getAppearanceRevision,
  getLocalTransformRevision,
  invalidateAppearance,
  setSceneNodeAdapter,
  setTransformX,
} from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import type { RenderNodeAdapter } from '@flighthq/types';

import { registerRenderer } from './renderer';
import { createDisplayObjectRenderNode } from './renderNode';
import { adaptRenderNode, beginRenderNodeUpdate, isRenderNodeDirty } from './renderNodeAdapter';
import { createRenderState } from './renderState';

describe('adaptRenderNode', () => {
  it('sets updateChildren to true when no resolver is attached', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.updateChildren = false;

    adaptRenderNode(state, source, data);

    expect(data.updateChildren).toBe(true);
  });

  it('sets updateChildren from a non-null adapter result', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    const adapter: RenderNodeAdapter = {
      adapt: vi.fn().mockReturnValue(false),
    };
    data.resolver = adapter;

    adaptRenderNode(state, source, data);

    expect(data.updateChildren).toBe(false);
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
    data.resolver = adapter;

    adaptRenderNode(state, source, data);

    expect(data.renderer).toBe(renderer);
  });
});

describe('beginRenderNodeUpdate', () => {
  it('copies the scene resolver onto the render node', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    const adapter: RenderNodeAdapter = {
      adapt: vi.fn().mockReturnValue(null),
    };
    setSceneNodeAdapter(source, adapter);

    beginRenderNodeUpdate(source, data);

    expect(data.resolver).toBe(adapter);
  });

  it('resets source and local transform revision', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.source = { kind: Symbol('Other') } as any;
    data.lastLocalTransformID = 10;

    beginRenderNodeUpdate(source, data);

    expect(data.source).toBe(source);
    expect(data.lastLocalTransformID).toBe(-1);
  });
});

describe('isRenderNodeDirty', () => {
  it('returns false when source and parent are clean', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.lastAppearanceID = getAppearanceRevision(source);
    data.lastLocalTransformID = getLocalTransformRevision(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(false);
  });

  it('returns true when appearance changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.lastAppearanceID = getAppearanceRevision(source);
    data.lastLocalTransformID = getLocalTransformRevision(source);
    invalidateAppearance(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(true);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.lastAppearanceID = getAppearanceRevision(source);
    data.lastLocalTransformID = getLocalTransformRevision(source);
    const parentData = createDisplayObjectRenderNode(state, createDisplayObject());
    parentData.transformFrameID = state.currentFrameID;

    expect(isRenderNodeDirty(state, source, data, parentData)).toBe(true);
  });

  it('returns true when transform changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.transform2D = createMatrix();
    data.lastAppearanceID = getAppearanceRevision(source);
    data.lastLocalTransformID = getLocalTransformRevision(source);
    setTransformX(source, 10);

    expect(isRenderNodeDirty(state, source, data)).toBe(true);
  });
});
