import type { LayoutNode, LayoutTree } from '@flighthq/types/contract';

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
});

describe('resolveLayoutTree', () => {
  it('writes every root as the available rectangle', () => {
    const out = new Float32Array(8);
    const state = createLayoutState();
    expect(resolveLayoutTree(out, state, tree([root, { ...root }]), new Float32Array(4), 320, 180)).toBe(true);
    expect([...out]).toEqual([0, 0, 320, 180, 0, 0, 320, 180]);
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
      requiredLength: 8,
    });
  });

  it('returns a sentinel for an intrinsic-size buffer that is too small', () => {
    const state = createLayoutState();
    expect(resolveLayoutTree(new Float32Array(8), state, tree([root, child]), new Float32Array(3), 100, 100)).toBe(
      false,
    );
    expect(explainLayoutResolution(state, tree([root, child]), -1)?.kind).toBe('IntrinsicSizesTooSmall');
  });

  it('rejects a child that does not follow its parent', () => {
    const invalid = tree([{ ...root, parentIndex: 0 }]);
    const state = createLayoutState();
    expect(resolveLayoutTree(new Float32Array(4), state, invalid, new Float32Array(2), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, invalid, 0)).toMatchObject({ kind: 'InvalidHierarchy', nodeIndex: 0 });
  });

  it('reports an unregistered parent kind only when it has a child to arrange', () => {
    const state = createLayoutState();
    const input = tree([root, child]);
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, 0)).toMatchObject({
      kind: 'UnregisteredKind',
      resolverKind: 'acme.Root',
    });
    expect(explainLayoutResolution(createLayoutState(), tree([root]), 0)).toBeNull();
  });
});
