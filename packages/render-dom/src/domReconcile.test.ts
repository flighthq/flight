import { detectDOMStructureChange, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import { createDOMRenderState } from './domRenderState';
import type { DOMRenderStateInternal } from './internal';

function makeInternal() {
  const container = document.createElement('div');
  return createDOMRenderState(container) as unknown as DOMRenderStateInternal;
}

describe('detectDOMStructureChange', () => {
  it('returns true when needsReconcile is already set', () => {
    const internal = makeInternal();
    expect(detectDOMStructureChange(internal, 0, true)).toBe(true);
  });

  it('returns true when lengths differ', () => {
    const internal = makeInternal();
    internal.domOrderLength = 2;
    expect(detectDOMStructureChange(internal, 1, false)).toBe(true);
  });

  it('returns false when order lists are identical', () => {
    const internal = makeInternal();
    const node = {} as any;
    internal.domOrderLength = 1;
    internal.domOrderList[0] = node;
    internal.domNextOrderList[0] = node;
    expect(detectDOMStructureChange(internal, 1, false)).toBe(false);
  });

  it('returns true when a node differs at any position', () => {
    const internal = makeInternal();
    internal.domOrderLength = 1;
    internal.domOrderList[0] = {} as any;
    internal.domNextOrderList[0] = {} as any;
    expect(detectDOMStructureChange(internal, 1, false)).toBe(true);
  });
});

describe('processDOMNode', () => {
  it('calls drawFn and registers the element for a new node', () => {
    const internal = makeInternal();
    const node = {} as any;
    const el = document.createElement('div');

    const result = processDOMNode(internal, node, 0, () => { internal.domCurrentElement = el; }, 0);

    expect(result.newLength).toBe(1);
    expect(result.needsReconcile).toBe(true);
    expect(internal.domElementMap.get(node)).toBe(el);
    expect(internal.domNextOrderList[0]).toBe(node);
  });

  it('skips drawFn for a known node with no dirty frames', () => {
    const internal = makeInternal();
    const node = { appearanceFrameID: -1, transformFrameID: -1 } as any;
    const el = document.createElement('div');
    internal.domElementMap.set(node, el);

    let called = false;
    const result = processDOMNode(internal, node, 0, () => { called = true; }, 0);

    expect(called).toBe(false);
    expect(result.needsReconcile).toBe(false);
    expect(result.newLength).toBe(1);
  });

  it('sets needsReconcile when the element changes for a known node', () => {
    const internal = makeInternal();
    const node = { appearanceFrameID: 1, transformFrameID: -1 } as any;
    const oldEl = document.createElement('div');
    const newEl = document.createElement('canvas');
    internal.domElementMap.set(node, oldEl);

    const result = processDOMNode(internal, node, 1, () => { internal.domCurrentElement = newEl; }, 0);

    expect(result.needsReconcile).toBe(true);
    expect(internal.domElementMap.get(node)).toBe(newEl);
  });
});

describe('reconcileDOMContainer', () => {
  it('removes foreign elements not in the new element set', () => {
    const internal = makeInternal();
    const foreign = document.createElement('span');
    internal.element.appendChild(foreign);

    reconcileDOMContainer(internal.element, internal, 0);

    expect(internal.element.contains(foreign)).toBe(false);
  });

  it('places tracked elements in correct order', () => {
    const internal = makeInternal();
    const elA = document.createElement('div');
    const elB = document.createElement('span');
    const nodeA = {} as any;
    const nodeB = {} as any;
    internal.domElementMap.set(nodeA, elA);
    internal.domElementMap.set(nodeB, elB);
    internal.domNextOrderList[0] = nodeA;
    internal.domNextOrderList[1] = nodeB;

    reconcileDOMContainer(internal.element, internal, 2);

    const children = Array.from(internal.element.children);
    expect(children.indexOf(elA)).toBeLessThan(children.indexOf(elB));
  });
});

describe('swapDOMOrderLists', () => {
  it('promotes the next list to the current list', () => {
    const internal = makeInternal();
    const node = {} as any;
    internal.domNextOrderList[0] = node;

    swapDOMOrderLists(internal, 1);

    expect(internal.domOrderList[0]).toBe(node);
    expect(internal.domOrderLength).toBe(1);
  });

  it('recycles the old current list as the next scratch buffer', () => {
    const internal = makeInternal();
    const prevList = internal.domOrderList;

    swapDOMOrderLists(internal, 0);

    expect(internal.domNextOrderList).toBe(prevList);
  });
});
