import { getRuntime as _getRuntime } from '@flighthq/scene-graph-core';
import type { DisplayObject, DisplayObjectRuntime } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import {
  getAppearanceID,
  getLocalBoundsID,
  getLocalTransformID,
  getWorldTransformID,
  invalidate,
  invalidateAppearance,
  invalidateLocalBounds,
  invalidateLocalTransform,
  invalidateParentCache,
  invalidateWorldBounds,
} from './revision';

function getRuntime(source: DisplayObject) {
  return _getRuntime(source) as DisplayObjectRuntime;
}

let displayObject: DisplayObject;
beforeEach(() => {
  displayObject = createDisplayObject();
});

describe('getAppearanceID', () => {
  it('returns appearanceID', () => {
    const state = getRuntime(displayObject);
    state.appearanceID = 100;
    expect(getAppearanceID(displayObject)).toStrictEqual(state.appearanceID);
  });
});

describe('getLocalBoundsID', () => {
  it('returns localBoundsID', () => {
    const state = getRuntime(displayObject);
    state.localBoundsID = 100;
    expect(getLocalBoundsID(displayObject)).toStrictEqual(state.localBoundsID);
  });
});

describe('getLocalTransformID', () => {
  it('returns localTransformID', () => {
    const state = getRuntime(displayObject);
    state.localTransformID = 100;
    expect(getLocalTransformID(displayObject)).toStrictEqual(state.localTransformID);
  });
});

describe('getWorldTransformID', () => {
  it('returns worldTransformID', () => {
    const state = getRuntime(displayObject);
    state.worldTransformID = 100;
    expect(getWorldTransformID(displayObject)).toStrictEqual(state.worldTransformID);
  });
});

describe('invalidate', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const appearanceID = getRuntime(displayObject).appearanceID;
    const localBoundsID = getRuntime(displayObject).localBoundsID;
    const localTransformID = getRuntime(displayObject).localTransformID;
    invalidate(displayObject);
    expect(getRuntime(displayObject).appearanceID).toBe(appearanceID + 1);
    expect(getRuntime(displayObject).appearanceID).toBe(localBoundsID + 1);
    expect(getRuntime(displayObject).appearanceID).toBe(localTransformID + 1);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const appearanceID = getRuntime(displayObject).appearanceID;
    invalidateAppearance(displayObject);
    expect(getRuntime(displayObject).appearanceID).toBe(appearanceID + 1);
  });

  it('should wrap around appearanceID correctly using >>> 0', () => {
    const state = getRuntime(displayObject);
    state.appearanceID = 0xffffffff; // max 32-bit uint
    invalidateAppearance(displayObject);
    expect(getRuntime(displayObject).appearanceID).toBe(0);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const localBoundsID = getRuntime(displayObject).localBoundsID;
    invalidateLocalBounds(displayObject);
    expect(getRuntime(displayObject).localBoundsID).toBe(localBoundsID + 1);
  });

  it('should wrap around localBoundsID correctly using >>> 0', () => {
    const state = getRuntime(displayObject);
    state.localBoundsID = 0xffffffff; // max 32-bit uint
    invalidateLocalBounds(displayObject);
    expect(getRuntime(displayObject).localBoundsID).toBe(0);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getRuntime(displayObject).localTransformID;
    invalidateLocalTransform(displayObject);
    expect(getRuntime(displayObject).localTransformID).toBe(localTransformID + 1);
  });

  it('should wrap around localTransformID correctly using >>> 0', () => {
    const state = getRuntime(displayObject);
    state.localTransformID = 0xffffffff; // max 32-bit uint
    invalidateLocalTransform(displayObject);
    expect(getRuntime(displayObject).localTransformID).toBe(0);
  });
});

describe('invalidateParentCache', () => {
  it('invalidates the world transform parent transform cached ID', () => {
    const state = getRuntime(displayObject);
    state.worldTransformUsingParentTransformID = 1;
    invalidateParentCache(displayObject);
    expect(state.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('invalidateWorldBounds', () => {
  it('invalidates supporting values for world bounds calculations', () => {
    const state = getRuntime(displayObject);
    state.worldBoundsRectUsingWorldTransformID = 1;
    state.worldBoundsRectUsingLocalBoundsID = 1;
    invalidateWorldBounds(displayObject);
    expect(state.worldBoundsRectUsingWorldTransformID).toBe(-1);
    expect(state.worldBoundsRectUsingLocalBoundsID).toBe(-1);
  });
});
