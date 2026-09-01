import type { FlightDocumentLayoutBinding, LayoutNode, LayoutTree, NodeAny } from '@flighthq/types/contract';

import { createLayoutState, registerLayoutResolver } from './layoutState';
import { explainLayoutResolution, resolveLayoutTree } from './resolveLayoutTree';

function tree(nodes: LayoutNode[]): LayoutTree {
  return { nodes };
}

const root: LayoutNode = { containerStyle: null, itemStyle: null, kind: 'acme.Root', parentIndex: -1 };
const child: LayoutNode = { containerStyle: null, itemStyle: null, kind: 'acme.Leaf', parentIndex: 0 };

describe('explainLayoutResolution', () => {
  it('diagnoses an unregistered container without running resolution', () => {
    const state = createLayoutState();
    const input = tree([root, child]);
    expect(explainLayoutResolution(state, input, 0)).toEqual({
      actualLength: 0,
      kind: 'UnregisteredKind',
      nodeIndex: 0,
      parentIndex: -1,
      requiredLength: 0,
      resolverKind: 'acme.Root',
    });
  });

  it('diagnoses invalid hierarchy without retained state', () => {
    const invalid = tree([{ ...root, parentIndex: -2 }]);
    expect(explainLayoutResolution(createLayoutState(), invalid, 0)).toMatchObject({
      kind: 'InvalidHierarchy',
      nodeIndex: 0,
      parentIndex: -2,
    });
    expect(explainLayoutResolution(createLayoutState(), tree([{ ...root, parentIndex: 0 }]), 0)).toMatchObject({
      kind: 'InvalidHierarchy',
      nodeIndex: 0,
      parentIndex: 0,
    });
  });

  it('returns null at the exact upper node-index boundary', () => {
    expect(explainLayoutResolution(createLayoutState(), tree([root, child]), 2)).toBeNull();
  });

  it('returns a retained failure only for its matching node', () => {
    const state = createLayoutState();
    const input = tree([root, child]);
    registerLayoutResolver(state, root.kind, () => 'InvalidItemStyle');
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, -1)?.kind).toBe('InvalidItemStyle');
    expect(explainLayoutResolution(state, input, 1)?.kind).toBe('InvalidItemStyle');
    expect(explainLayoutResolution(state, input, 0)).toBeNull();
  });

  it('does not return a node-zero failure for a different node', () => {
    const state = createLayoutState();
    const input = tree([root, child]);
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, 1)).toBeNull();
  });
});

describe('resolveLayoutTree', () => {
  it('consumes an inert FlightDocument binding without moving kind ownership out of LayoutState', () => {
    const binding: FlightDocumentLayoutBinding = {
      targets: [{ name: 'root' } as NodeAny, { name: 'child' } as NodeAny],
      tree: {
        nodes: [
          { containerStyle: null, itemStyle: null, kind: 'acme.Root', parentIndex: -1 },
          { containerStyle: null, itemStyle: null, kind: 'acme.Leaf', parentIndex: 0 },
        ],
      },
    };
    const state = createLayoutState();

    expect(resolveLayoutTree(new Float32Array(8), state, binding.tree, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, binding.tree, 0)).toMatchObject({
      kind: 'UnregisteredKind',
      resolverKind: 'acme.Root',
    });
  });

  it('writes every root as the available rectangle', () => {
    const out = new Float32Array(8);
    const state = createLayoutState();
    expect(resolveLayoutTree(out, state, tree([root, { ...root }]), new Float32Array(4), 320, 180)).toBe(true);
    expect([...out]).toEqual([0, 0, 320, 180, 0, 0, 320, 180]);
  });

  it('normalizes non-finite and negative available root sizes', () => {
    const out = new Float32Array(4);
    const state = createLayoutState();
    expect(resolveLayoutTree(out, state, tree([root]), new Float32Array(2), Number.NaN, -1)).toBe(true);
    expect([...out]).toEqual([0, 0, 0, 0]);
  });

  it('dispatches a child through its parent kind', () => {
    const out = new Float32Array(8);
    const state = createLayoutState();
    registerLayoutResolver(state, root.kind, (target, _tree, _sizes, _parent, childIndex) => {
      target.set([10, 20, 30, 40], childIndex * 4);
      return null;
    });
    expect(resolveLayoutTree(out, state, tree([root, child]), new Float32Array(4), 100, 100)).toBe(true);
    expect([...out.slice(4)]).toEqual([10, 20, 30, 40]);
  });

  it('returns a sentinel for an out buffer that is too small', () => {
    const state = createLayoutState();
    expect(resolveLayoutTree(new Float32Array(7), state, tree([root, child]), new Float32Array(4), 100, 100)).toBe(
      false,
    );
    expect(explainLayoutResolution(state, tree([root, child]), -1)).toMatchObject({
      actualLength: 7,
      kind: 'OutputTooSmall',
      nodeIndex: -1,
      parentIndex: -1,
      requiredLength: 8,
    });
  });

  it('returns a sentinel for an intrinsic-size buffer that is too small', () => {
    const state = createLayoutState();
    expect(resolveLayoutTree(new Float32Array(8), state, tree([root, child]), new Float32Array(3), 100, 100)).toBe(
      false,
    );
    expect(explainLayoutResolution(state, tree([root, child]), -1)).toMatchObject({
      kind: 'IntrinsicSizesTooSmall',
      nodeIndex: -1,
      parentIndex: -1,
    });
  });

  it('rejects a child that does not follow its parent', () => {
    const invalid = tree([{ ...root, parentIndex: 0 }]);
    const state = createLayoutState();
    expect(resolveLayoutTree(new Float32Array(4), state, invalid, new Float32Array(2), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, invalid, 0)).toMatchObject({ kind: 'InvalidHierarchy', nodeIndex: 0 });
  });

  it('rejects a parent index below the root sentinel', () => {
    const invalid = tree([{ ...root, parentIndex: -2 }]);
    const state = createLayoutState();
    expect(resolveLayoutTree(new Float32Array(4), state, invalid, new Float32Array(2), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, invalid, 0)).toMatchObject({
      kind: 'InvalidHierarchy',
      nodeIndex: 0,
      parentIndex: -2,
    });
  });

  it('clears retained failure details before a successful resolution', () => {
    const state = createLayoutState();
    const input = tree([root]);
    expect(resolveLayoutTree(new Float32Array(3), state, input, new Float32Array(2), 100, 100)).toBe(false);
    expect(resolveLayoutTree(new Float32Array(4), state, input, new Float32Array(2), 100, 100)).toBe(true);
    expect(explainLayoutResolution(state, input, -1)).toBeNull();
    expect(state.lastFailureNodeIndex).toBe(-1);
    expect(state.lastFailureParentIndex).toBe(-1);
  });

  it('reports an unregistered parent kind only when it has a child to arrange', () => {
    const state = createLayoutState();
    const input = tree([root, child]);
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, 0)).toMatchObject({
      kind: 'UnregisteredKind',
      parentIndex: -1,
      resolverKind: 'acme.Root',
    });
    expect(explainLayoutResolution(createLayoutState(), tree([root]), 0)).toBeNull();
  });
});
