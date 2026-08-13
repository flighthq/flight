import type { AnchorLayoutItemStyle, LayoutNode, LayoutTree } from '@flighthq/types/contract';
import { AnchorLayoutKind } from '@flighthq/types/contract';

import { registerAnchorLayoutResolver } from './anchorLayout';
import { createLayoutState } from './layoutState';
import { explainLayoutResolution, resolveLayoutTree } from './resolveLayoutTree';

function node(parentIndex: number, itemStyle: AnchorLayoutItemStyle | null = null): LayoutNode {
  return { containerStyle: null, itemStyle, kind: AnchorLayoutKind, parentIndex };
}

function resolve(nodes: LayoutNode[], intrinsicSizes: number[], width = 200, height = 100): Float32Array {
  const out = new Float32Array(nodes.length * 4);
  const state = createLayoutState();
  registerAnchorLayoutResolver(state);
  expect(resolveLayoutTree(out, state, { nodes }, intrinsicSizes, width, height)).toBe(true);
  return out;
}

describe('registerAnchorLayoutResolver', () => {
  it.each([
    ['top', 87, 0],
    ['bottom', 87, 108],
    ['left', 0, 54],
    ['right', 174, 54],
    ['topleft', 0, 0],
    ['topright', 174, 0],
    ['bottomleft', 0, 108],
    ['bottomright', 174, 108],
  ] as const)('aligns a natural-size child to %s', (align, x, y) => {
    const out = resolve([node(-1), node(0, { align })], [0, 0, 37, 19], 211, 127);
    expect([...out.slice(4)]).toEqual([x, y, 37, 19]);
  });

  it('stretches between opposing pins as the available rect changes', () => {
    const nodes = [node(-1), node(0, { bottom: 10, left: 20, right: 30, top: 5 })];
    expect([...resolve(nodes, [0, 0, 1, 1], 200, 100).slice(4)]).toEqual([20, 5, 150, 85]);
    expect([...resolve(nodes, [0, 0, 1, 1], 300, 160).slice(4)]).toEqual([20, 5, 250, 145]);
  });

  it('lets an edge pin override alignment on only that axis', () => {
    const out = resolve([node(-1), node(0, { align: 'bottomright', left: 12 })], [0, 0, 30, 20]);
    expect([...out.slice(4)]).toEqual([12, 80, 30, 20]);
  });

  it('positions from right and bottom pins on asymmetric axes', () => {
    const out = resolve([node(-1), node(0, { bottom: 13, right: 11 })], [0, 0, 37, 19], 211, 127);
    expect([...out.slice(4)]).toEqual([163, 95, 37, 19]);
  });

  it('normalizes invalid intrinsic sizes for a null item style', () => {
    const out = resolve([node(-1), node(0)], [0, 0, Number.NaN, -1], 211, 127);
    expect([...out.slice(4)]).toEqual([0, 0, 0, 0]);
  });

  it('propagates nested rectangles in one parent-before-child pass', () => {
    const out = resolve(
      [node(-1), node(0, { bottom: 17, left: 13, right: 29, top: 7 }), node(1, { align: 'bottomright' })],
      [0, 0, 0, 0, 31, 19],
      211,
      127,
    );
    expect([...out.slice(4, 8)]).toEqual([13, 7, 169, 103]);
    expect([...out.slice(8)]).toEqual([151, 91, 31, 19]);
  });

  it('rejects a style shape its parent resolver cannot interpret', () => {
    const input: LayoutTree = { nodes: [node(-1), { ...node(0), itemStyle: { align: 'middle' } }] };
    const state = createLayoutState();
    registerAnchorLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, 1)?.kind).toBe('InvalidItemStyle');
  });

  it('rejects a non-empty anchor container style', () => {
    const input: LayoutTree = { nodes: [{ ...node(-1), containerStyle: { unexpected: true } }, node(0)] };
    const state = createLayoutState();
    registerAnchorLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, 0)?.kind).toBe('InvalidContainerStyle');
  });
});
