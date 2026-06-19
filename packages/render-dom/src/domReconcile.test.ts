import type { DOMRenderStateRuntime } from '@flighthq/types';

import { hasDOMStructureChanged, processDOMNode, reconcileDOMContainer, swapDOMOrderLists } from './domReconcile';
import { createDOMRenderState, getDOMRenderStateRuntime } from './domRenderState';

function makeRuntime(): DOMRenderStateRuntime {
  const container = document.createElement('div');
  return getDOMRenderStateRuntime(createDOMRenderState(container));
}

describe('hasDOMStructureChanged', () => {
  it('returns true when needsReconcile is already set', () => {
    const runtime = makeRuntime();
    expect(hasDOMStructureChanged(runtime, 0, true)).toBe(true);
  });

  it('returns true when lengths differ', () => {
    const runtime = makeRuntime();
    runtime.domOrderLength = 2;
    expect(hasDOMStructureChanged(runtime, 1, false)).toBe(true);
  });

  it('returns false when order lists are identical', () => {
    const runtime = makeRuntime();
    const node = {} as any;
    runtime.domOrderLength = 1;
    runtime.domOrderList[0] = node;
    runtime.domNextOrderList[0] = node;
    expect(hasDOMStructureChanged(runtime, 1, false)).toBe(false);
  });

  it('returns true when a node differs at any position', () => {
    const runtime = makeRuntime();
    runtime.domOrderLength = 1;
    runtime.domOrderList[0] = {} as any;
    runtime.domNextOrderList[0] = {} as any;
    expect(hasDOMStructureChanged(runtime, 1, false)).toBe(true);
  });
});

describe('processDOMNode', () => {
  it('calls drawFn and registers the element for a new node', () => {
    const runtime = makeRuntime();
    const node = {} as any;
    const el = document.createElement('div');

    const result = processDOMNode(
      runtime,
      node,
      0,
      () => {
        runtime.domCurrentElement = el;
      },
      0,
    );

    expect(result.newLength).toBe(1);
    expect(result.needsReconcile).toBe(true);
    expect(runtime.domElementMap.get(node)).toBe(el);
    expect(runtime.domNextOrderList[0]).toBe(node);
  });

  it('skips drawFn for a known node with no dirty frames', () => {
    const runtime = makeRuntime();
    const node = { appearanceFrameID: -1, transformFrameID: -1 } as any;
    const el = document.createElement('div');
    runtime.domElementMap.set(node, el);

    let called = false;
    const result = processDOMNode(
      runtime,
      node,
      0,
      () => {
        called = true;
      },
      0,
    );

    expect(called).toBe(false);
    expect(result.needsReconcile).toBe(false);
    expect(result.newLength).toBe(1);
  });

  it('sets needsReconcile when the element changes for a known node', () => {
    const runtime = makeRuntime();
    const node = { appearanceFrameID: 1, transformFrameID: -1 } as any;
    const oldEl = document.createElement('div');
    const newEl = document.createElement('canvas');
    runtime.domElementMap.set(node, oldEl);

    const result = processDOMNode(
      runtime,
      node,
      1,
      () => {
        runtime.domCurrentElement = newEl;
      },
      0,
    );

    expect(result.needsReconcile).toBe(true);
    expect(runtime.domElementMap.get(node)).toBe(newEl);
  });
});

describe('reconcileDOMContainer', () => {
  it('removes foreign elements not in the new element set', () => {
    const runtime = makeRuntime();
    const container = document.createElement('div');
    const foreign = document.createElement('span');
    container.appendChild(foreign);

    reconcileDOMContainer(container, runtime, 0);

    expect(container.contains(foreign)).toBe(false);
  });

  it('places tracked elements in correct order', () => {
    const runtime = makeRuntime();
    const container = document.createElement('div');
    const elA = document.createElement('div');
    const elB = document.createElement('span');
    const nodeA = {} as any;
    const nodeB = {} as any;
    runtime.domElementMap.set(nodeA, elA);
    runtime.domElementMap.set(nodeB, elB);
    runtime.domNextOrderList[0] = nodeA;
    runtime.domNextOrderList[1] = nodeB;

    reconcileDOMContainer(container, runtime, 2);

    const children = Array.from(container.children);
    expect(children.indexOf(elA)).toBeLessThan(children.indexOf(elB));
  });
});

describe('swapDOMOrderLists', () => {
  it('promotes the next list to the current list', () => {
    const runtime = makeRuntime();
    const node = {} as any;
    runtime.domNextOrderList[0] = node;

    swapDOMOrderLists(runtime, 1);

    expect(runtime.domOrderList[0]).toBe(node);
    expect(runtime.domOrderLength).toBe(1);
  });

  it('recycles the old current list as the next scratch buffer', () => {
    const runtime = makeRuntime();
    const prevList = runtime.domOrderList;

    swapDOMOrderLists(runtime, 0);

    expect(runtime.domNextOrderList).toBe(prevList);
  });
});
