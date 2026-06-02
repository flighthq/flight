import { createRenderState } from '@flighthq/render';
import { setSceneNodeResolver } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import type { RenderState, SceneNodeResolver } from '@flighthq/types';

import type { RenderTreeStateInternal } from './internal';
import { registerDisplayObjectRenderNodeResolver, resolveDisplayObjectRenderNode } from './renderNodeResolver';
import { createDisplayObjectRenderNode } from './renderTreeNode2d';

describe('registerDisplayObjectRenderNodeResolver', () => {
  it('appends multiple resolvers in registration order', () => {
    const state = createRenderState() as unknown as RenderTreeStateInternal;
    const r1 = vi.fn();
    const r2 = vi.fn();
    registerDisplayObjectRenderNodeResolver(state as unknown as RenderState, r1);
    registerDisplayObjectRenderNodeResolver(state as unknown as RenderState, r2);
    expect(state.displayObjectRenderNodeResolvers).toEqual([r1, r2]);
  });

  it('pushes the resolver into displayObjectRenderNodeResolvers', () => {
    const state = createRenderState() as unknown as RenderTreeStateInternal;
    const resolver = vi.fn();
    registerDisplayObjectRenderNodeResolver(state as unknown as RenderState, resolver);
    expect(state.displayObjectRenderNodeResolvers).toContain(resolver);
  });
});

describe('resolveDisplayObjectRenderNode', () => {
  it('falls back to the default node when no resolver handles the source', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, source);
    const result = resolveDisplayObjectRenderNode(state, source, () => node);
    expect(result.node).toBe(node);
    expect(result.updateChildren).toBe(true);
  });

  it('uses state-level resolver when no per-node resolver is set', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, source);
    const skipped = vi.fn(() => null);
    const resolver = vi.fn(() => ({ node, updateChildren: false }));
    registerDisplayObjectRenderNodeResolver(state, resolver);
    registerDisplayObjectRenderNodeResolver(state, skipped);
    const result = resolveDisplayObjectRenderNode(state, source, () => createDisplayObjectRenderNode(state, source));
    expect(result.node).toBe(node);
    expect(result.updateChildren).toBe(false);
    expect(node.updateChildren).toBe(false);
    expect(skipped).not.toHaveBeenCalled();
  });

  it('per-node resolver takes priority over state-level resolvers', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const nodeFromPerNode = createDisplayObjectRenderNode(state, source);
    const stateResolver = vi.fn(() => ({ node: createDisplayObjectRenderNode(state, source), updateChildren: true }));
    registerDisplayObjectRenderNodeResolver(state, stateResolver);

    const perNodeResolver: SceneNodeResolver = {
      updateChildren: false,
      resolve: vi.fn(() => ({ node: nodeFromPerNode })),
    };
    setSceneNodeResolver(source, perNodeResolver);

    const result = resolveDisplayObjectRenderNode(state, source, () => createDisplayObjectRenderNode(state, source));
    expect(result.node).toBe(nodeFromPerNode);
    expect(result.updateChildren).toBe(false);
    expect(stateResolver).not.toHaveBeenCalled();
  });

  it('falls through to state-level resolvers when per-node resolver returns null', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const nodeFromState = createDisplayObjectRenderNode(state, source);
    const stateResolver = vi.fn(() => ({ node: nodeFromState, updateChildren: true }));
    registerDisplayObjectRenderNodeResolver(state, stateResolver);

    const perNodeResolver: SceneNodeResolver = {
      updateChildren: false,
      resolve: vi.fn(() => null),
    };
    setSceneNodeResolver(source, perNodeResolver);

    const result = resolveDisplayObjectRenderNode(state, source, () => createDisplayObjectRenderNode(state, source));
    expect(result.node).toBe(nodeFromState);
    expect(stateResolver).toHaveBeenCalled();
  });
});
