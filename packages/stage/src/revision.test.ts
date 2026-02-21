import type { DisplayObject } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';
import { getGraphState } from './internal/graphState';
import {
  getAppearanceID,
  getLocalBoundsID,
  getLocalTransformID,
  getWorldTransformID,
  invalidate,
  invalidateAppearance,
  invalidateLocalBounds,
  invalidateLocalTransform,
} from './revision';

let displayObject: DisplayObject;
beforeEach(() => {
  displayObject = createDisplayObject();
});

describe('getAppearanceID', () => {
  it('returns appearanceID', () => {
    const state = getGraphState(displayObject);
    state.appearanceID = 100;
    expect(getAppearanceID(displayObject)).toStrictEqual(state.appearanceID);
  });
});

describe('getLocalBoundsID', () => {
  it('returns localBoundsID', () => {
    const state = getGraphState(displayObject);
    state.localBoundsID = 100;
    expect(getLocalBoundsID(displayObject)).toStrictEqual(state.localBoundsID);
  });
});

describe('getLocalTransformID', () => {
  it('returns localTransformID', () => {
    const state = getGraphState(displayObject);
    state.localTransformID = 100;
    expect(getLocalTransformID(displayObject)).toStrictEqual(state.localTransformID);
  });
});

describe('getWorldTransformID', () => {
  it('returns worldTransformID', () => {
    const state = getGraphState(displayObject);
    state.worldTransformID = 100;
    expect(getWorldTransformID(displayObject)).toStrictEqual(state.worldTransformID);
  });
});

describe('invalidate', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const appearanceID = getGraphState(displayObject).appearanceID;
    const localBoundsID = getGraphState(displayObject).localBoundsID;
    const localTransformID = getGraphState(displayObject).localTransformID;
    invalidate(displayObject);
    expect(getGraphState(displayObject).appearanceID).toBe(appearanceID + 1);
    expect(getGraphState(displayObject).appearanceID).toBe(localBoundsID + 1);
    expect(getGraphState(displayObject).appearanceID).toBe(localTransformID + 1);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const appearanceID = getGraphState(displayObject).appearanceID;
    invalidateAppearance(displayObject);
    expect(getGraphState(displayObject).appearanceID).toBe(appearanceID + 1);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const localBoundsID = getGraphState(displayObject).localBoundsID;
    invalidateLocalBounds(displayObject);
    expect(getGraphState(displayObject).localBoundsID).toBe(localBoundsID + 1);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const localTransformID = getGraphState(displayObject).localTransformID;
    invalidateLocalTransform(displayObject);
    expect(getGraphState(displayObject).localTransformID).toBe(localTransformID + 1);
  });
});
