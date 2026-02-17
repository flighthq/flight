import { createDisplayObject } from './createDisplayObject';
import { getGraphState } from './internal/graphState';
import { invalidate, invalidateAppearance, invalidateLocalBounds, invalidateLocalTransform } from './revision';

describe('invalidateAppearance', () => {
  it('increments appearanceID, localBoundsID, localTransformID', () => {
    const displayObject = createDisplayObject();
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
    const displayObject = createDisplayObject();
    const appearanceID = getGraphState(displayObject).appearanceID;
    invalidateAppearance(displayObject);
    expect(getGraphState(displayObject).appearanceID).toBe(appearanceID + 1);
  });
});

describe('invalidateLocalBounds', () => {
  it('increments localBoundsID', () => {
    const displayObject = createDisplayObject();
    const localBoundsID = getGraphState(displayObject).localBoundsID;
    invalidateLocalBounds(displayObject);
    expect(getGraphState(displayObject).localBoundsID).toBe(localBoundsID + 1);
  });
});

describe('invalidateLocalTransform', () => {
  it('increments localTransformID', () => {
    const displayObject = createDisplayObject();
    const localTransformID = getGraphState(displayObject).localTransformID;
    invalidateLocalTransform(displayObject);
    expect(getGraphState(displayObject).localTransformID).toBe(localTransformID + 1);
  });
});
