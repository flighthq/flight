import { createColorMatrixAdjustment, createTintAdjustment } from '@flighthq/adjustments';

import { createNode3D, getNode3DRuntime } from './sceneNode';
import {
  addNode3DColorAdjustment,
  getNode3DColorAdjustments,
  setNode3DColorAdjustments,
  setNode3DColorAdjustmentTint,
} from './sceneNodeColorAdjustment';

describe('addNode3DColorAdjustment', () => {
  it('lazily creates the stack and resolves its material-feature data', () => {
    const node = createNode3D();
    const adjustment = createTintAdjustment(0x7f3fffff);

    addNode3DColorAdjustment(node, adjustment);

    expect(getNode3DColorAdjustments(node)).toEqual([adjustment]);
    expect(getNode3DRuntime(node).resolvedColorTransform?.redMultiplier).toBeCloseTo(0x7f / 255);
  });
});

describe('getNode3DColorAdjustments', () => {
  it('returns null before a stack is authored', () => {
    expect(getNode3DColorAdjustments(createNode3D())).toBeNull();
  });
});

describe('setNode3DColorAdjustments', () => {
  it('clears the resolved transform with the stack', () => {
    const node = createNode3D();
    setNode3DColorAdjustmentTint(node, 0xff0000ff);

    setNode3DColorAdjustments(node, null);

    expect(getNode3DRuntime(node).resolvedColorTransform).toBeNull();
  });

  it('caches a complete channel-mixing matrix without marking it unsupported', () => {
    const node = createNode3D();
    const matrix = [1, 0.5, 0, 0, 10, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNode3DColorAdjustments(node, [createColorMatrixAdjustment(matrix)]);
    expect(getNode3DRuntime(node).resolvedColorMatrix).toEqual(matrix);
    expect(getNode3DRuntime(node).colorAdjustmentsChannelMixing).toBe(false);
  });
});

describe('setNode3DColorAdjustmentTint', () => {
  it('authors a packed tint through the shared adjustment model', () => {
    const node = createNode3D();

    setNode3DColorAdjustmentTint(node, 0x00ff00ff);

    expect(getNode3DRuntime(node).resolvedColorTransform?.greenMultiplier).toBe(1);
    expect(getNode3DRuntime(node).resolvedColorTransform?.redMultiplier).toBe(0);
  });
});
