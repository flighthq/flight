import {
  createDisplayObject,
  ensureWorldTransform,
  getAppearanceID,
  getLocalBoundsID,
  getWorldTransformID,
  invalidateAppearance,
  invalidateLocalBounds,
  invalidateLocalTransform,
} from '@flighthq/stage';
import type { DisplayObject, RenderableData } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';
import { isRenderableDirty } from './dirty';

describe('isRenderableDirty', () => {
  let source: DisplayObject;
  let data: RenderableData;

  beforeEach(() => {
    source = createDisplayObject();
    data = createRenderableData(source);
  });

  it('returns true when first called on new renderable data', () => {
    expect(isRenderableDirty(data)).toBe(true);
  });

  it('sets values when dirty', () => {
    isRenderableDirty(data);
    expect(data.appearanceID).toBe(getAppearanceID(source));
    expect(data.worldTransformID).toBe(getWorldTransformID(source));
    expect(data.localBoundsID).toBe(getLocalBoundsID(source));
  });

  it('returns false when values match', () => {
    isRenderableDirty(data);
    expect(isRenderableDirty(data)).toBe(false);
  });

  it('returns true if appearanceID has changed', () => {
    isRenderableDirty(data);
    expect(isRenderableDirty(data)).toBe(false);
    invalidateAppearance(source);
    expect(isRenderableDirty(data)).toBe(true);
  });

  it('returns true if worldTransformID has changed', () => {
    isRenderableDirty(data);
    expect(isRenderableDirty(data)).toBe(false);
    invalidateLocalTransform(source);
    ensureWorldTransform(source);
    expect(isRenderableDirty(data)).toBe(true);
  });

  it('returns true if localBoundsID has changed', () => {
    isRenderableDirty(data);
    expect(isRenderableDirty(data)).toBe(false);
    invalidateLocalBounds(source);
    expect(isRenderableDirty(data)).toBe(true);
  });
});
