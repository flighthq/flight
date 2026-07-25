import { addNodeChild, invalidateNodeAppearance } from '@flighthq/node';
import { describe, expect, it } from 'vitest';

import { createNode3D } from './sceneNode';
import { ensureNode3DWorldAlpha, getNode3DWorldAlpha, setNode3DAlpha } from './sceneNodeAppearance';

describe('ensureNode3DWorldAlpha', () => {
  it('caches until the appearance is invalidated (revision-gated, not recomputed every read)', () => {
    const node = createNode3D();
    setNode3DAlpha(node, 0.5);
    expect(getNode3DWorldAlpha(node)).toBeCloseTo(0.5);

    // Raw field write bypassing the invalidation contract: the cache must hold.
    node.alpha = 0.9;
    expect(getNode3DWorldAlpha(node)).toBeCloseTo(0.5);

    // Explicit invalidation recomputes.
    invalidateNodeAppearance(node);
    expect(getNode3DWorldAlpha(node)).toBeCloseTo(0.9);
  });

  it('propagates a parent alpha change down to a resolved child', () => {
    const parent = createNode3D();
    const child = createNode3D();
    addNodeChild(parent, child);
    setNode3DAlpha(parent, 0.5);
    setNode3DAlpha(child, 0.5);
    expect(getNode3DWorldAlpha(child)).toBeCloseTo(0.25);

    setNode3DAlpha(parent, 1);
    expect(getNode3DWorldAlpha(child)).toBeCloseTo(0.5);
  });

  it('propagates a grandparent alpha change through an unchanged middle node to a grandchild', () => {
    const root = createNode3D();
    const mid = createNode3D();
    const leaf = createNode3D();
    addNodeChild(root, mid);
    addNodeChild(mid, leaf);
    setNode3DAlpha(leaf, 0.5);
    // Prime the grandchild's resolved worldAlpha (1 · 1 · 0.5), then fade only the grandparent.
    expect(getNode3DWorldAlpha(leaf)).toBeCloseTo(0.5);
    setNode3DAlpha(root, 0.2);
    // The middle node's own alpha is unchanged, but its resolved alpha drops — the grandchild must follow.
    expect(getNode3DWorldAlpha(leaf)).toBeCloseTo(0.1);
  });
});

describe('getNode3DWorldAlpha', () => {
  it('resolves to 1 for a fresh node', () => {
    expect(getNode3DWorldAlpha(createNode3D())).toBeCloseTo(1);
  });

  it('combines parent and self opacity', () => {
    const parent = createNode3D();
    const child = createNode3D();
    addNodeChild(parent, child);
    setNode3DAlpha(parent, 0.5);
    setNode3DAlpha(child, 0.4);
    expect(getNode3DWorldAlpha(child)).toBeCloseTo(0.2);
  });

  it('is correct on demand without a render walk', () => {
    const node = createNode3D();
    setNode3DAlpha(node, 0.6);
    // No prepareScene3DRender — ensure-on-access must still resolve it.
    ensureNode3DWorldAlpha(node);
    expect(getNode3DWorldAlpha(node)).toBeCloseTo(0.6);
  });
});

describe('setNode3DAlpha', () => {
  it('sets the node opacity and invalidates so worldAlpha recomputes', () => {
    const node = createNode3D();
    expect(getNode3DWorldAlpha(node)).toBeCloseTo(1);
    setNode3DAlpha(node, 0.3);
    expect(node.alpha).toBeCloseTo(0.3);
    expect(getNode3DWorldAlpha(node)).toBeCloseTo(0.3);
  });
});
