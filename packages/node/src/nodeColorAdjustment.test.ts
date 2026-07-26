import { createColorMatrixAdjustment, createTintAdjustment } from '@flighthq/adjustments/contract';
import { NodeKind } from '@flighthq/types/contract';

import { createNode, getNodeRuntime } from './node';
import {
  addNodeColorAdjustment,
  getNodeColorAdjustments,
  setNodeColorAdjustments,
  setNodeColorAdjustmentsTint,
} from './nodeColorAdjustment';

describe('addNodeColorAdjustment', () => {
  it('lazily creates the stack and resolves its material-feature data', () => {
    const node = createNode(NodeKind);
    const adjustment = createTintAdjustment(0x7f3fffff);

    addNodeColorAdjustment(node, adjustment);

    expect(getNodeColorAdjustments(node)).toEqual([adjustment]);
    expect(getNodeRuntime(node).resolvedColorScaleBias?.redScale).toBeCloseTo(0x7f / 255);
  });
});

describe('getNodeColorAdjustments', () => {
  it('returns null before a stack is authored', () => {
    expect(getNodeColorAdjustments(createNode(NodeKind))).toBeNull();
  });
});

describe('setNodeColorAdjustments', () => {
  it('clears the resolved transform with the stack', () => {
    const node = createNode(NodeKind);
    setNodeColorAdjustmentsTint(node, 0xff0000ff);

    setNodeColorAdjustments(node, null);

    expect(getNodeRuntime(node).resolvedColorScaleBias).toBeNull();
  });

  it('caches a complete channel-mixing matrix without marking it unsupported', () => {
    const node = createNode(NodeKind);
    const matrix = [1, 0.5, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    setNodeColorAdjustments(node, [createColorMatrixAdjustment(matrix)]);
    expect(getNodeRuntime(node).resolvedColorMatrix).toEqual(matrix);
    expect(getNodeRuntime(node).colorAdjustmentsUnsupported).toBe(false);
  });
});

describe('setNodeColorAdjustmentsTint', () => {
  it('authors a packed tint through the shared adjustment model', () => {
    const node = createNode(NodeKind);

    setNodeColorAdjustmentsTint(node, 0x00ff00ff);

    expect(getNodeRuntime(node).resolvedColorScaleBias?.greenScale).toBe(1);
    expect(getNodeRuntime(node).resolvedColorScaleBias?.redScale).toBe(0);
  });
});
