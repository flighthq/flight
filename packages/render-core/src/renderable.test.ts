import {
  createDisplayObject,
  ensureWorldTransform,
  getAppearanceID,
  getLocalBoundsID,
  getWorldTransformID,
  invalidateAppearance,
  invalidateLocalBounds,
} from '@flighthq/stage';
import type { DisplayObject, RenderableData } from '@flighthq/types';

import { createRenderableData } from './createRenderableData';
import { createRendererState } from './createRendererState';
import { getRenderableData, updateRenderableData } from './renderable';

describe('getRenderableData', () => {
  it('creates renderable data if not present already', () => {
    const state = createRendererState();
    const source = createDisplayObject();
    expect(state.renderableDataMap.has(source)).toBe(false);
    getRenderableData(state, source);
    expect(state.renderableDataMap.has(source)).toBe(true);
  });
});

describe('updateRenderableData', () => {
  let source: DisplayObject;
  let data: RenderableData;

  beforeEach(() => {
    source = createDisplayObject();
    data = createRenderableData(source);
  });

  it('does nothing if data is already dirty', () => {
    const { appearanceID, worldTransformID, localBoundsID } = data;
    data.dirty = true;
    invalidateAppearance(source);
    invalidateLocalBounds(source);
    ensureWorldTransform(source);
    updateRenderableData(data);
    expect(data.appearanceID).toStrictEqual(appearanceID);
    expect(data.worldTransformID).toStrictEqual(worldTransformID);
    expect(data.localBoundsID).toStrictEqual(localBoundsID);
    expect(data.dirty).toBe(true);
  });

  it('syncs IDs if data is not dirty and appearanceID changed', () => {
    data.dirty = false;
    invalidateAppearance(source);
    updateRenderableData(data);
    expect(data.appearanceID).toStrictEqual(getAppearanceID(source));
  });

  it('sets dirty true if data is not dirty and appearanceID changed', () => {
    data.dirty = false;
    invalidateAppearance(source);
    updateRenderableData(data);
    expect(data.dirty).toBe(true);
  });

  it('syncs IDs if data is not dirty and worldTransformID changed', () => {
    data.dirty = false;
    ensureWorldTransform(source);
    updateRenderableData(data);
    expect(data.worldTransformID).toStrictEqual(getWorldTransformID(source));
  });

  it('sets dirty true if data is not dirty and appearanceID changed', () => {
    data.dirty = false;
    ensureWorldTransform(source);
    updateRenderableData(data);
    expect(data.dirty).toBe(true);
  });

  it('syncs IDs if data is not dirty and localBoundsID changed', () => {
    data.dirty = false;
    invalidateLocalBounds(source);
    updateRenderableData(data);
    expect(data.localBoundsID).toStrictEqual(getLocalBoundsID(source));
  });

  it('sets dirty true if data is not dirty and appearanceID changed', () => {
    data.dirty = false;
    invalidateLocalBounds(source);
    updateRenderableData(data);
    expect(data.dirty).toBe(true);
  });
});
