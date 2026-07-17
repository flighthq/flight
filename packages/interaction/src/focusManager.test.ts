import { createDisplayObject } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle, invalidateNodeLocalTransform } from '@flighthq/node';
import { connectSignal, createSignal, emitSignal } from '@flighthq/signals';
import type { DisplayObject, FocusEventData, InputKeyboardData } from '@flighthq/types';

import {
  clearFocus,
  connectFocusNavigation,
  createFocusManager,
  focusNextNode,
  focusNodeInDirection,
  focusPreviousNode,
  getFocusOrder,
  getFocusedNode,
  isNodeFocused,
  setFocusedNode,
} from './focusManager';
import { enableInteractionSignals } from './interactionManager';
import { setNodeFocusable, setNodeTabIndex } from './nodeInteractionState';

function focusable(tabIndex: number = -1): DisplayObject {
  const node = createDisplayObject();
  setNodeFocusable(node, true);
  if (tabIndex !== -1) setNodeTabIndex(node, tabIndex);
  return node;
}

// A focusable node positioned in world space, so directional navigation can compare bounds centers.
function placed(x: number, y: number): DisplayObject {
  const node = focusable();
  node.x = x;
  node.y = y;
  invalidateNodeLocalTransform(node);
  setRectangle(getNodeLocalBoundsRectangle(node), 0, 0, 20, 20);
  return node;
}

function keyInput() {
  return { onKeyDown: createSignal<(data: Readonly<InputKeyboardData>) => void>() };
}

function keyData(key: string, shiftKey: boolean = false): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: key,
    ctrlKey: false,
    key,
    keyCode: 0,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey,
    timeStamp: 0,
  };
}

function sceneOf(...nodes: readonly DisplayObject[]): DisplayObject {
  const root = createDisplayObject();
  for (const node of nodes) addNodeChild(root, node);
  return root;
}

describe('clearFocus', () => {
  it('drops focus and fires onFocusOut on the previously focused node', () => {
    const a = focusable();
    const manager = createFocusManager(sceneOf(a));
    setFocusedNode(manager, a);
    let out = 0;
    connectSignal(enableInteractionSignals(a).onFocusOut, () => out++);

    clearFocus(manager);
    expect(getFocusedNode(manager)).toBeNull();
    expect(out).toBe(1);
  });
});

describe('connectFocusNavigation', () => {
  it('advances on Tab and retreats on Shift+Tab, and stops after disconnect', () => {
    const a = focusable();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, b));
    const input = keyInput();
    const disconnect = connectFocusNavigation(input, manager);

    emitSignal(input.onKeyDown, keyData('Tab'));
    expect(getFocusedNode(manager)).toBe(a);
    emitSignal(input.onKeyDown, keyData('Tab'));
    expect(getFocusedNode(manager)).toBe(b);
    emitSignal(input.onKeyDown, keyData('Tab', true));
    expect(getFocusedNode(manager)).toBe(a);

    disconnect();
    emitSignal(input.onKeyDown, keyData('Tab'));
    expect(getFocusedNode(manager)).toBe(a);
  });

  it('drives directional navigation from the arrow keys only when arrowKeys is set', () => {
    const center = placed(100, 100);
    const right = placed(200, 100);
    const manager = createFocusManager(sceneOf(center, right));
    setFocusedNode(manager, center);

    const plain = keyInput();
    const disconnectPlain = connectFocusNavigation(plain, manager);
    emitSignal(plain.onKeyDown, keyData('ArrowRight'));
    expect(getFocusedNode(manager)).toBe(center);
    disconnectPlain();

    connectFocusNavigation(keyInput(), manager, { arrowKeys: true });
    const arrows = keyInput();
    connectFocusNavigation(arrows, manager, { arrowKeys: true });
    emitSignal(arrows.onKeyDown, keyData('ArrowRight'));
    expect(getFocusedNode(manager)).toBe(right);
  });
});

describe('createFocusManager', () => {
  it('starts unfocused with wrap on by default, and honors wrap: false', () => {
    const root = createDisplayObject();
    expect(createFocusManager(root)).toEqual({ focused: null, root, wrap: true });
    expect(createFocusManager(root, { wrap: false }).wrap).toBe(false);
  });
});

describe('focusNextNode', () => {
  it('advances through the order and wraps when enabled', () => {
    const a = focusable();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, b));

    expect(focusNextNode(manager)).toBe(a);
    expect(focusNextNode(manager)).toBe(b);
    expect(focusNextNode(manager)).toBe(a);
  });

  it('returns null at the last stop when wrap is off', () => {
    const a = focusable();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, b), { wrap: false });
    setFocusedNode(manager, b);

    expect(focusNextNode(manager)).toBeNull();
    expect(getFocusedNode(manager)).toBe(b);
  });

  it('returns null when there are no focus stops', () => {
    const manager = createFocusManager(sceneOf(createDisplayObject()));
    expect(focusNextNode(manager)).toBeNull();
  });
});

describe('focusNodeInDirection', () => {
  it('picks the nearest stop on the requested side of the focused node', () => {
    const center = placed(100, 100);
    const right = placed(200, 100);
    const left = placed(0, 100);
    const up = placed(100, 0);
    const down = placed(100, 200);
    const manager = createFocusManager(sceneOf(center, right, left, up, down));

    setFocusedNode(manager, center);
    expect(focusNodeInDirection(manager, 'right')).toBe(right);
    setFocusedNode(manager, center);
    expect(focusNodeInDirection(manager, 'left')).toBe(left);
    setFocusedNode(manager, center);
    expect(focusNodeInDirection(manager, 'up')).toBe(up);
    setFocusedNode(manager, center);
    expect(focusNodeInDirection(manager, 'down')).toBe(down);
  });

  it('returns null when nothing is focused or nothing lies that way', () => {
    const center = placed(100, 100);
    const left = placed(0, 100);
    const manager = createFocusManager(sceneOf(center, left));

    expect(focusNodeInDirection(manager, 'right')).toBeNull();
    setFocusedNode(manager, center);
    expect(focusNodeInDirection(manager, 'right')).toBeNull();
    expect(getFocusedNode(manager)).toBe(center);
  });
});

describe('focusPreviousNode', () => {
  it('retreats through the order and wraps when enabled', () => {
    const a = focusable();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, b));
    setFocusedNode(manager, a);

    expect(focusPreviousNode(manager)).toBe(b);
    expect(focusPreviousNode(manager)).toBe(a);
  });
});

describe('getFocusedNode', () => {
  it('reflects the current focus', () => {
    const a = focusable();
    const manager = createFocusManager(sceneOf(a));
    expect(getFocusedNode(manager)).toBeNull();
    setFocusedNode(manager, a);
    expect(getFocusedNode(manager)).toBe(a);
  });
});

describe('getFocusOrder', () => {
  it('collects focusable nodes in tree order, skipping non-focusable ones', () => {
    const a = focusable();
    const decorative = createDisplayObject();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, decorative, b));

    expect(getFocusOrder(manager)).toEqual([a, b]);
  });

  it('orders explicit tabIndex ahead of natural order, ascending', () => {
    const natural1 = focusable();
    const natural2 = focusable();
    const explicit = focusable(1);
    const manager = createFocusManager(sceneOf(natural1, natural2, explicit));

    expect(getFocusOrder(manager)).toEqual([explicit, natural1, natural2]);
  });

  it('skips a disabled node and its subtree', () => {
    const a = focusable();
    const disabledParent = createDisplayObject();
    disabledParent.enabled = false;
    const buried = focusable();
    addNodeChild(disabledParent, buried);
    const manager = createFocusManager(sceneOf(a, disabledParent));

    expect(getFocusOrder(manager)).toEqual([a]);
  });
});

describe('isNodeFocused', () => {
  it('is true only for the focused node', () => {
    const a = focusable();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, b));
    setFocusedNode(manager, a);

    expect(isNodeFocused(manager, a)).toBe(true);
    expect(isNodeFocused(manager, b)).toBe(false);
  });
});

describe('setFocusedNode', () => {
  it('rejects a non-focusable node without changing focus', () => {
    const plain = createDisplayObject();
    const manager = createFocusManager(sceneOf(plain));
    expect(setFocusedNode(manager, plain)).toBe(false);
    expect(getFocusedNode(manager)).toBeNull();
  });

  it('fires onFocusOut then onFocusIn with relatedTarget set to the other node', () => {
    const a = focusable();
    const b = focusable();
    const manager = createFocusManager(sceneOf(a, b));
    setFocusedNode(manager, a);

    let outRelated: unknown = 'unset';
    let inRelated: unknown = 'unset';
    connectSignal(enableInteractionSignals(a).onFocusOut, (data: Readonly<FocusEventData>) => {
      outRelated = data.relatedTarget;
    });
    connectSignal(enableInteractionSignals(b).onFocusIn, (data: Readonly<FocusEventData>) => {
      inRelated = data.relatedTarget;
    });

    setFocusedNode(manager, b);
    expect(outRelated).toBe(b);
    expect(inRelated).toBe(a);
  });

  it('bubbles onFocusIn up to an ancestor listener', () => {
    const child = focusable();
    const root = sceneOf(child);
    const manager = createFocusManager(root);

    let currentTarget: unknown = null;
    let target: unknown = null;
    connectSignal(enableInteractionSignals(root).onFocusIn, (data: Readonly<FocusEventData>) => {
      currentTarget = data.currentTarget;
      target = data.target;
    });

    setFocusedNode(manager, child);
    expect(target).toBe(child);
    expect(currentTarget).toBe(root);
  });

  it('is a no-op that still returns true when refocusing the same node', () => {
    const a = focusable();
    const manager = createFocusManager(sceneOf(a));
    setFocusedNode(manager, a);
    let events = 0;
    connectSignal(enableInteractionSignals(a).onFocusIn, () => events++);

    expect(setFocusedNode(manager, a)).toBe(true);
    expect(events).toBe(0);
  });
});
