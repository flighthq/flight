import { connectSignal } from '@flighthq/signals';
import { describe, expect, it, vi } from 'vitest';

import {
  addWorldChild,
  addWorldChildAt,
  containsWorldChild,
  getWorldChildAt,
  getWorldChildByName,
  getWorldChildIndex,
  getWorldNumChildren,
  getWorldParent,
  getWorldRoot,
  removeWorldChild,
  removeWorldChildAt,
  removeWorldChildren,
  setWorldChildIndex,
  swapWorldChildren,
  swapWorldChildrenAt,
} from './worldHierarchy';
import { createWorldNode, getWorldNodeSignals, WorldNodeKind } from './worldNode';

describe('addWorldChildAt', () => {
  it('inserts a child at the requested index', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    const c = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    addWorldChildAt(parent, c, 1);
    expect(getWorldChildAt(parent, 0)).toBe(a);
    expect(getWorldChildAt(parent, 1)).toBe(c);
    expect(getWorldChildAt(parent, 2)).toBe(b);
  });

  it('lazily allocates the children array on first insert', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChildAt(parent, child, 0);
    expect(getWorldNumChildren(parent)).toBe(1);
  });

  it('throws when the child is null', () => {
    const parent = createWorldNode();
    expect(() => addWorldChildAt(parent, null as unknown as ReturnType<typeof createWorldNode>, 0)).toThrow(TypeError);
  });

  it('throws when adding a node as a child of itself', () => {
    const node = createWorldNode();
    expect(() => addWorldChildAt(node, node, 0)).toThrow(TypeError);
  });

  it('throws when the index is negative', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    expect(() => addWorldChildAt(parent, child, -1)).toThrow(RangeError);
  });

  it('throws when the index is past the end of an existing list', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    expect(() => addWorldChildAt(parent, b, 5)).toThrow(RangeError);
  });

  it('throws when the index is past the end of an empty list', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    expect(() => addWorldChildAt(parent, child, 1)).toThrow(RangeError);
  });

  it('returns the same child unchanged when re-added at its current index', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    const changed = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildrenChanged, changed);
    expect(addWorldChildAt(parent, b, 1)).toBe(b);
    expect(getWorldChildIndex(parent, b)).toBe(1);
  });

  it('reorders an existing child when re-added at a different index', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    addWorldChildAt(parent, b, 0);
    expect(getWorldChildIndex(parent, b)).toBe(0);
    expect(getWorldChildIndex(parent, a)).toBe(1);
  });

  it('emits onChildAdded and onParentChanged when a new child is linked', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    const added = vi.fn();
    const parentChanged = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildAdded, added);
    connectSignal(getWorldNodeSignals(child).onParentChanged, parentChanged);
    addWorldChild(parent, child);
    expect(added).toHaveBeenCalledWith(child);
    expect(parentChanged).toHaveBeenCalledTimes(1);
  });
});

describe('containsWorldChild', () => {
  it('returns true for a direct child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    expect(containsWorldChild(parent, child)).toBe(true);
  });

  it('returns true for a deep descendant', () => {
    const root = createWorldNode();
    const mid = createWorldNode();
    const leaf = createWorldNode();
    addWorldChild(root, mid);
    addWorldChild(mid, leaf);
    expect(containsWorldChild(root, leaf)).toBe(true);
  });

  it('returns true when source and child are the same node', () => {
    const node = createWorldNode();
    expect(containsWorldChild(node, node)).toBe(true);
  });

  it('returns false for an unrelated node', () => {
    const a = createWorldNode();
    const b = createWorldNode();
    expect(containsWorldChild(a, b)).toBe(false);
  });
});

describe('getWorldChildAt', () => {
  it('returns the child at a valid index', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    expect(getWorldChildAt(parent, 0)).toBe(child);
  });

  it('returns null when there are no children', () => {
    const parent = createWorldNode();
    expect(getWorldChildAt(parent, 0)).toBe(null);
  });

  it('returns null for an out-of-range index', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    expect(getWorldChildAt(parent, 5)).toBe(null);
    expect(getWorldChildAt(parent, -1)).toBe(null);
  });
});

describe('getWorldChildByName', () => {
  it('returns the first child with a matching name', () => {
    const parent = createWorldNode();
    const a = createWorldNode(WorldNodeKind, { name: 'alpha' });
    const b = createWorldNode(WorldNodeKind, { name: 'beta' });
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    expect(getWorldChildByName(parent, 'beta')).toBe(b);
  });

  it('returns null when no child matches', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode(WorldNodeKind, { name: 'alpha' }));
    expect(getWorldChildByName(parent, 'missing')).toBe(null);
  });

  it('returns null when there are no children', () => {
    const parent = createWorldNode();
    expect(getWorldChildByName(parent, 'anything')).toBe(null);
  });
});

describe('getWorldChildIndex', () => {
  it('returns the index of a child', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    expect(getWorldChildIndex(parent, b)).toBe(1);
  });

  it('returns -1 for a non-child', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    expect(getWorldChildIndex(parent, createWorldNode())).toBe(-1);
  });

  it('returns -1 when there are no children', () => {
    const parent = createWorldNode();
    expect(getWorldChildIndex(parent, createWorldNode())).toBe(-1);
  });
});

describe('removeWorldChild', () => {
  it('returns the falsy child unchanged when none is supplied', () => {
    const parent = createWorldNode();
    expect(removeWorldChild(parent, null as unknown as ReturnType<typeof createWorldNode>)).toBe(null);
  });

  it('does nothing when the child belongs to a different parent', () => {
    const a = createWorldNode();
    const b = createWorldNode();
    const child = createWorldNode();
    addWorldChild(a, child);
    removeWorldChild(b, child);
    expect(getWorldParent(child)).toBe(a);
    expect(getWorldNumChildren(a)).toBe(1);
  });

  it('emits onChildRemoved when a child is unlinked', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    const removed = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildRemoved, removed);
    removeWorldChild(parent, child);
    expect(removed).toHaveBeenCalledWith(child);
  });
});

describe('removeWorldChildAt', () => {
  it('removes the child at the given index', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    expect(removeWorldChildAt(parent, 0)).toBe(a);
    expect(getWorldParent(a)).toBe(null);
    expect(getWorldChildAt(parent, 0)).toBe(b);
  });

  it('returns null for an out-of-range index', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    expect(removeWorldChildAt(parent, 5)).toBe(null);
    expect(removeWorldChildAt(parent, -1)).toBe(null);
  });

  it('returns null when there are no children', () => {
    const parent = createWorldNode();
    expect(removeWorldChildAt(parent, 0)).toBe(null);
  });
});

describe('removeWorldChildren', () => {
  it('removes every child by default', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    addWorldChild(parent, createWorldNode());
    addWorldChild(parent, createWorldNode());
    removeWorldChildren(parent);
    expect(getWorldNumChildren(parent)).toBe(0);
  });

  it('removes only the requested range', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    const c = createWorldNode();
    const d = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    addWorldChild(parent, c);
    addWorldChild(parent, d);
    removeWorldChildren(parent, 1, 2);
    expect(getWorldChildIndex(parent, a)).toBe(0);
    expect(getWorldChildIndex(parent, d)).toBe(1);
    expect(getWorldParent(b)).toBe(null);
    expect(getWorldParent(c)).toBe(null);
  });

  it('does nothing when there are no children', () => {
    const parent = createWorldNode();
    expect(() => removeWorldChildren(parent)).not.toThrow();
  });

  it('does nothing when beginIndex is past the end', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    addWorldChild(parent, a);
    removeWorldChildren(parent, 5);
    expect(getWorldNumChildren(parent)).toBe(1);
  });

  it('throws when endIndex is before beginIndex', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    addWorldChild(parent, createWorldNode());
    expect(() => removeWorldChildren(parent, 1, 0)).toThrow(RangeError);
  });

  it('throws when beginIndex is negative', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    expect(() => removeWorldChildren(parent, -1, 0)).toThrow(RangeError);
  });

  it('throws when endIndex is past the end', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    expect(() => removeWorldChildren(parent, 0, 5)).toThrow(RangeError);
  });
});

describe('setWorldChildIndex', () => {
  it('moves a child to a new index', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    const c = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    addWorldChild(parent, c);
    setWorldChildIndex(parent, a, 2);
    expect(getWorldChildIndex(parent, a)).toBe(2);
    expect(getWorldChildIndex(parent, b)).toBe(0);
    expect(getWorldChildIndex(parent, c)).toBe(1);
  });

  it('emits onChildrenOrderChanged when the index actually changes', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    const reordered = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildrenOrderChanged, reordered);
    setWorldChildIndex(parent, a, 1);
    expect(reordered).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the child is already at the index', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    addWorldChild(parent, a);
    const reordered = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildrenOrderChanged, reordered);
    setWorldChildIndex(parent, a, 0);
    expect(reordered).not.toHaveBeenCalled();
  });

  it('does nothing when the node has no children', () => {
    const parent = createWorldNode();
    expect(() => setWorldChildIndex(parent, createWorldNode(), 0)).not.toThrow();
  });

  it('does nothing when the child belongs to a different parent', () => {
    const parent = createWorldNode();
    const other = createWorldNode();
    const a = createWorldNode();
    const stranger = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(other, stranger);
    setWorldChildIndex(parent, stranger, 0);
    expect(getWorldChildIndex(parent, a)).toBe(0);
  });
});

describe('swapWorldChildren', () => {
  it('swaps the positions of two children', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    swapWorldChildren(parent, a, b);
    expect(getWorldChildIndex(parent, a)).toBe(1);
    expect(getWorldChildIndex(parent, b)).toBe(0);
  });

  it('emits onChildrenOrderChanged', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    const reordered = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildrenOrderChanged, reordered);
    swapWorldChildren(parent, a, b);
    expect(reordered).toHaveBeenCalledTimes(1);
  });

  it('does nothing when a node has no children', () => {
    const parent = createWorldNode();
    expect(() => swapWorldChildren(parent, createWorldNode(), createWorldNode())).not.toThrow();
  });

  it('does nothing when one child has a different parent', () => {
    const parent = createWorldNode();
    const other = createWorldNode();
    const a = createWorldNode();
    const stranger = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(other, stranger);
    const reordered = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildrenOrderChanged, reordered);
    swapWorldChildren(parent, a, stranger);
    expect(reordered).not.toHaveBeenCalled();
  });
});

describe('swapWorldChildrenAt', () => {
  it('swaps the children at two indices', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    const b = createWorldNode();
    const c = createWorldNode();
    addWorldChild(parent, a);
    addWorldChild(parent, b);
    addWorldChild(parent, c);
    swapWorldChildrenAt(parent, 0, 2);
    expect(getWorldChildAt(parent, 0)).toBe(c);
    expect(getWorldChildAt(parent, 2)).toBe(a);
  });

  it('does nothing when the two indices are equal', () => {
    const parent = createWorldNode();
    const a = createWorldNode();
    addWorldChild(parent, a);
    const reordered = vi.fn();
    connectSignal(getWorldNodeSignals(parent).onChildrenOrderChanged, reordered);
    swapWorldChildrenAt(parent, 0, 0);
    expect(reordered).not.toHaveBeenCalled();
  });

  it('does nothing when the node has no children', () => {
    const parent = createWorldNode();
    expect(() => swapWorldChildrenAt(parent, 0, 1)).not.toThrow();
  });

  it('throws when an index is out of bounds', () => {
    const parent = createWorldNode();
    addWorldChild(parent, createWorldNode());
    addWorldChild(parent, createWorldNode());
    expect(() => swapWorldChildrenAt(parent, 0, 5)).toThrow(RangeError);
    expect(() => swapWorldChildrenAt(parent, -1, 1)).toThrow(RangeError);
  });
});
