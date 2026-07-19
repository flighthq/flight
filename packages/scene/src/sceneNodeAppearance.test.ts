import { addNodeChild, invalidateNodeAppearance } from '@flighthq/node';
import { describe, expect, it } from 'vitest';

import { createSceneNode } from './sceneNode';
import { ensureSceneNodeWorldAlpha, getSceneNodeWorldAlpha, setSceneNodeAlpha } from './sceneNodeAppearance';

describe('ensureSceneNodeWorldAlpha', () => {
  it('caches until the appearance is invalidated (revision-gated, not recomputed every read)', () => {
    const node = createSceneNode();
    setSceneNodeAlpha(node, 0.5);
    expect(getSceneNodeWorldAlpha(node)).toBeCloseTo(0.5);

    // Raw field write bypassing the invalidation contract: the cache must hold.
    node.alpha = 0.9;
    expect(getSceneNodeWorldAlpha(node)).toBeCloseTo(0.5);

    // Explicit invalidation recomputes.
    invalidateNodeAppearance(node);
    expect(getSceneNodeWorldAlpha(node)).toBeCloseTo(0.9);
  });

  it('propagates a parent alpha change down to a resolved child', () => {
    const parent = createSceneNode();
    const child = createSceneNode();
    addNodeChild(parent, child);
    setSceneNodeAlpha(parent, 0.5);
    setSceneNodeAlpha(child, 0.5);
    expect(getSceneNodeWorldAlpha(child)).toBeCloseTo(0.25);

    setSceneNodeAlpha(parent, 1);
    expect(getSceneNodeWorldAlpha(child)).toBeCloseTo(0.5);
  });
});

describe('getSceneNodeWorldAlpha', () => {
  it('resolves to 1 for a fresh node', () => {
    expect(getSceneNodeWorldAlpha(createSceneNode())).toBeCloseTo(1);
  });

  it('combines parent and self opacity', () => {
    const parent = createSceneNode();
    const child = createSceneNode();
    addNodeChild(parent, child);
    setSceneNodeAlpha(parent, 0.5);
    setSceneNodeAlpha(child, 0.4);
    expect(getSceneNodeWorldAlpha(child)).toBeCloseTo(0.2);
  });

  it('is correct on demand without a render walk', () => {
    const node = createSceneNode();
    setSceneNodeAlpha(node, 0.6);
    // No prepareSceneRender — ensure-on-access must still resolve it.
    ensureSceneNodeWorldAlpha(node);
    expect(getSceneNodeWorldAlpha(node)).toBeCloseTo(0.6);
  });
});

describe('setSceneNodeAlpha', () => {
  it('sets the node opacity and invalidates so worldAlpha recomputes', () => {
    const node = createSceneNode();
    expect(getSceneNodeWorldAlpha(node)).toBeCloseTo(1);
    setSceneNodeAlpha(node, 0.3);
    expect(node.alpha).toBeCloseTo(0.3);
    expect(getSceneNodeWorldAlpha(node)).toBeCloseTo(0.3);
  });
});
