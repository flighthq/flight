import { createDisplayObject, createDisplayObjectGeneric } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle, invalidateNodeLocalTransform } from '@flighthq/node';
import { createSpatialIndex, createUniformGridSpatialBackend } from '@flighthq/spatial';
import { DisplayObjectKind } from '@flighthq/types';

import { hitTestGraphLocalBounds, registerHitTestPoint } from './hitTests';
import { createInteractionManager } from './interactionManager';
import { findSpatialInteractionTarget, refreshInteractionSpatialIndex } from './interactionSpatialIndex';
import { setNodeHitArea, setNodeHitTestEnabled } from './nodeInteractionState';

function candidate(x: number, y: number, w: number, h: number) {
  const obj = createDisplayObjectGeneric(DisplayObjectKind);
  obj.x = x;
  obj.y = y;
  invalidateNodeLocalTransform(obj);
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, w, h);
  setNodeHitTestEnabled(obj, true);
  return obj;
}

function managedScene() {
  registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
  const root = createDisplayObject();
  const index = createSpatialIndex(createUniformGridSpatialBackend(64));
  const manager = createInteractionManager(root, { spatialIndex: index });
  return { manager, root };
}

describe('findSpatialInteractionTarget', () => {
  it('returns the candidate whose region contains the point', () => {
    const { manager, root } = managedScene();
    const a = candidate(0, 0, 50, 50);
    const b = candidate(200, 200, 50, 50);
    addNodeChild(root, a);
    addNodeChild(root, b);
    refreshInteractionSpatialIndex(manager);

    expect(findSpatialInteractionTarget(manager, 25, 25)).toBe(a);
    expect(findSpatialInteractionTarget(manager, 225, 225)).toBe(b);
    expect(findSpatialInteractionTarget(manager, 500, 500)).toBeNull();
  });

  it('returns the topmost (last-drawn) candidate when regions overlap', () => {
    const { manager, root } = managedScene();
    const under = candidate(0, 0, 100, 100);
    const over = candidate(0, 0, 100, 100);
    addNodeChild(root, under);
    addNodeChild(root, over);
    refreshInteractionSpatialIndex(manager);

    expect(findSpatialInteractionTarget(manager, 50, 50)).toBe(over);
  });

  it('returns null before the index is refreshed', () => {
    const { manager, root } = managedScene();
    addNodeChild(root, candidate(0, 0, 50, 50));
    expect(findSpatialInteractionTarget(manager, 25, 25)).toBeNull();
  });
});

describe('refreshInteractionSpatialIndex', () => {
  it('indexes only opted-in nodes', () => {
    const { manager, root } = managedScene();
    const inert = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getNodeLocalBoundsRectangle(inert), 0, 0, 50, 50);
    addNodeChild(root, inert);
    refreshInteractionSpatialIndex(manager);

    expect(findSpatialInteractionTarget(manager, 25, 25)).toBeNull();

    setNodeHitTestEnabled(inert, true);
    refreshInteractionSpatialIndex(manager);
    expect(findSpatialInteractionTarget(manager, 25, 25)).toBe(inert);
  });

  it('indexes an atomic hitArea unit without descending into its children', () => {
    const { manager, root } = managedScene();
    const unit = candidate(0, 0, 100, 100);
    setNodeHitArea(unit, 'bounds');
    const child = candidate(0, 0, 20, 20);
    addNodeChild(root, unit);
    addNodeChild(unit, child);
    refreshInteractionSpatialIndex(manager);

    // The child sits inside the unit, but the atomic unit is what resolves.
    expect(findSpatialInteractionTarget(manager, 10, 10)).toBe(unit);
  });

  it('agrees with the linear pick after a transform change is re-synced', () => {
    const { manager, root } = managedScene();
    const a = candidate(0, 0, 50, 50);
    addNodeChild(root, a);
    refreshInteractionSpatialIndex(manager);
    expect(findSpatialInteractionTarget(manager, 25, 25)).toBe(a);

    a.x = 300;
    invalidateNodeLocalTransform(a);
    refreshInteractionSpatialIndex(manager);
    expect(findSpatialInteractionTarget(manager, 25, 25)).toBeNull();
    expect(findSpatialInteractionTarget(manager, 325, 25)).toBe(a);
  });
});
