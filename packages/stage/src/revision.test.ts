import { createDisplayObject } from './createDisplayObject';
import { getDisplayObjectState } from './internal/displayObjectState';
import { invalidate, invalidateAppearance, invalidateLocalBounds, invalidateLocalTransform } from './revision';

describe('invalidateAppearance', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const displayObject = createDisplayObject();
    const appearanceID = getDisplayObjectState(displayObject).appearanceID;
    const localBoundsID = getDisplayObjectState(displayObject).localBoundsID;
    const localTransformID = getDisplayObjectState(displayObject).localTransformID;
    invalidate(displayObject);
    expect(getDisplayObjectState(displayObject).appearanceID).toBe(appearanceID + 1);
    expect(getDisplayObjectState(displayObject).appearanceID).toBe(localBoundsID + 1);
    expect(getDisplayObjectState(displayObject).appearanceID).toBe(localTransformID + 1);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const displayObject = createDisplayObject();
    const appearanceID = getDisplayObjectState(displayObject).appearanceID;
    invalidateAppearance(displayObject);
    expect(getDisplayObjectState(displayObject).appearanceID).toBe(appearanceID + 1);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const displayObject = createDisplayObject();
    const localBoundsID = getDisplayObjectState(displayObject).localBoundsID;
    invalidateLocalBounds(displayObject);
    expect(getDisplayObjectState(displayObject).localBoundsID).toBe(localBoundsID + 1);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const displayObject = createDisplayObject();
    const localTransformID = getDisplayObjectState(displayObject).localTransformID;
    invalidateLocalTransform(displayObject);
    expect(getDisplayObjectState(displayObject).localTransformID).toBe(localTransformID + 1);
  });
});
