import { createDisplayObject } from './createDisplayObject';
import { getDerivedState } from './internal/derivedState';
import { invalidate, invalidateAppearance, invalidateLocalBounds, invalidateLocalTransform } from './invalidate';

describe('invalidateAppearance', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const displayObject = createDisplayObject();
    const appearanceID = getDerivedState(displayObject).appearanceID;
    const localBoundsID = getDerivedState(displayObject).localBoundsID;
    const localTransformID = getDerivedState(displayObject).localTransformID;
    invalidate(displayObject);
    expect(getDerivedState(displayObject).appearanceID).toBe(appearanceID + 1);
    expect(getDerivedState(displayObject).appearanceID).toBe(localBoundsID + 1);
    expect(getDerivedState(displayObject).appearanceID).toBe(localTransformID + 1);
  });
});

describe('invalidateAppearance', () => {
  it('increments appearanceID', () => {
    const displayObject = createDisplayObject();
    const appearanceID = getDerivedState(displayObject).appearanceID;
    invalidateAppearance(displayObject);
    expect(getDerivedState(displayObject).appearanceID).toBe(appearanceID + 1);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const displayObject = createDisplayObject();
    const localBoundsID = getDerivedState(displayObject).localBoundsID;
    invalidateLocalBounds(displayObject);
    expect(getDerivedState(displayObject).localBoundsID).toBe(localBoundsID + 1);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const displayObject = createDisplayObject();
    const localTransformID = getDerivedState(displayObject).localTransformID;
    invalidateLocalTransform(displayObject);
    expect(getDerivedState(displayObject).localTransformID).toBe(localTransformID + 1);
  });
});
