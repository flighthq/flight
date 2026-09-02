import { setRectangle } from '@flighthq/geometry/contract';
import {
  addNodeChild,
  createNode,
  disposeNode,
  getNodeLocalBoundsRectangle,
  invalidateNodeLocalTransform,
} from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { connectSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Cursor,
  InputKeyboardData,
  InputPointerData,
  InputSignals,
  InteractionManagerOptions,
} from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import { hitTestGraphLocalBounds } from './hitTests';
import { registerHitTest } from './hitTests';
import {
  captureInteractionPointer,
  connectInputToInteraction,
  connectInteractionSignal,
  createInteractionManager,
  createInteractionSignals,
  disconnectInteractionSignal,
  dispatchInteractionContextMenu,
  dispatchInteractionKeyDown,
  dispatchInteractionKeyUp,
  dispatchInteractionPointerCancel,
  dispatchInteractionPointerDown,
  dispatchInteractionPointerMove,
  dispatchInteractionPointerUp,
  dispatchInteractionWheel,
  enableInteractionSignals,
  getInteractionSignals,
  invalidateInteractionCursor,
  releaseInteractionPointer,
  setInteractionConnectGuard,
} from './interactionManager';
import { setNodeCursor, setNodeHitTestEnabled, setNodePointerDoubleClickEnabled } from './nodeInteractionState';

beforeAll(() => {
  registerHitTest(DisplayObjectKind, hitTestGraphLocalBounds);
});

describe('captureInteractionPointer', () => {
  it('routes pointer events to the captured target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerMove, () => fired++);

    captureInteractionPointer(manager, 3, child);
    dispatchInteractionPointerMove(manager, 500, 500, 0, { pointerId: 3 });
    expect(fired).toBe(1);
  });
});

describe('connectInputToInteraction', () => {
  it('routes normalized input signals into interaction dispatch', () => {
    const input = createInputSource();
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerDown, () => fired++);

    const disconnect = connectInputToInteraction(input, manager);
    emitSignal(input.onPointerDown, createInputPointerData(50, 50));
    disconnect();
    emitSignal(input.onPointerDown, createInputPointerData(50, 50));
    expect(fired).toBe(1);
  });

  it('routes normalized keyboard input into interaction dispatch', () => {
    const input = createInputSource();
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    let received = '';
    connectSignal(enableInteractionSignals(root).onKeyDown, (data) => {
      received = data.key;
    });

    connectInputToInteraction(input, manager);
    emitSignal(input.onKeyDown, createInputKeyboardData('a', 97));
    expect(received).toBe('a');
  });

  it('uses input timestamps for double-click qualification', () => {
    const input = createInputSource();
    const { child, manager } = createHitScene3D({ doubleClickDelay: 100 });
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    connectInputToInteraction(input, manager);
    emitSignal(input.onPointerDown, createInputPointerData(50, 50, 1000));
    emitSignal(input.onPointerUp, createInputPointerData(50, 50, 1000));
    emitSignal(input.onPointerDown, createInputPointerData(50, 50, 1200));
    emitSignal(input.onPointerUp, createInputPointerData(50, 50, 1200));

    expect(fired).toBe(0);
  });

  it('resets pending double clicks when the connection is torn down', () => {
    const input = createInputSource();
    const { child, manager } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    const disconnect = connectInputToInteraction(input, manager);
    emitSignal(input.onPointerDown, createInputPointerData(50, 50, 1000));
    emitSignal(input.onPointerUp, createInputPointerData(50, 50, 1000));
    disconnect();
    connectInputToInteraction(input, manager);
    emitSignal(input.onPointerDown, createInputPointerData(50, 50, 1100));
    emitSignal(input.onPointerUp, createInputPointerData(50, 50, 1100));

    expect(fired).toBe(0);
  });
});

describe('connectInteractionSignal', () => {
  it('can use tracked subscribers without scanning for direct signal connections', () => {
    const kind = 'TrackedSubscriberHitTest';
    const root = createNode(kind);
    setNodeHitTestEnabled(root, true);
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    let fired = 0;
    let hitTests = 0;
    registerHitTest(kind, () => {
      hitTests++;
      return true;
    });

    connectSignal(enableInteractionSignals(root).onPointerDown, () => fired++);
    dispatchInteractionPointerDown(manager, 50, 50);
    expect(fired).toBe(0);
    expect(hitTests).toBe(0);

    connectInteractionSignal(manager, root, 'onPointerDown', () => fired++);
    dispatchInteractionPointerDown(manager, 50, 50);
    expect(fired).toBe(2);
    expect(hitTests).toBe(1);
  });

  it('clears tracked once subscribers after dispatch', () => {
    const kind = 'TrackedOnceHitTest';
    const root = createNode(kind);
    setNodeHitTestEnabled(root, true);
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    let fired = 0;
    let hitTests = 0;
    registerHitTest(kind, () => {
      hitTests++;
      return true;
    });

    connectInteractionSignal(manager, root, 'onPointerDown', () => fired++, { once: true });
    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerDown(manager, 50, 50);
    expect(fired).toBe(1);
    expect(hitTests).toBe(1);
  });
});

describe('createInteractionManager', () => {
  it('creates an enabled manager by default', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    expect(manager.enabled).toBe(true);
    expect(manager.cursorTarget).toBeNull();
    expect(manager.pointerCaptures.size).toBe(0);
    expect(manager.pointerStates.size).toBe(0);
    expect(manager.root).toBe(root);
    expect(manager.trackedSubscribersOnly).toBe(false);
  });

  it('can create a disabled manager', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root, { enabled: false });
    expect(manager.enabled).toBe(false);
  });

  it('can create a manager that uses only tracked subscribers', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    expect(manager.enabled).toBe(true);
    expect(manager.trackedSubscribersOnly).toBe(true);
  });

  it('defaults cursorBackend to null and accepts one via options', () => {
    const root = createDisplayObject();
    expect(createInteractionManager(root).cursorBackend).toBeNull();
    const backend = { setCursor: () => {} };
    expect(createInteractionManager(root, { cursorBackend: backend }).cursorBackend).toBe(backend);
  });

  it('defaults and configures double-click thresholds', () => {
    const root = createDisplayObject();
    const defaults = createInteractionManager(root);
    expect(defaults.doubleClickDelay).toBe(500);
    expect(defaults.doubleClickDistance).toBe(4);

    const configured = createInteractionManager(root, { doubleClickDelay: 250, doubleClickDistance: 12 });
    expect(configured.doubleClickDelay).toBe(250);
    expect(configured.doubleClickDistance).toBe(12);
  });
});

describe('createInteractionSignals', () => {
  it('returns an object with interaction signals', () => {
    const signals = createInteractionSignals();
    expect(signals.onClick).toBeDefined();
    expect(signals.onContextMenu).toBeDefined();
    expect(signals.onDoubleClick).toBeDefined();
    expect(signals.onKeyDown).toBeDefined();
    expect(signals.onKeyUp).toBeDefined();
    expect(signals.onPointerCancel).toBeDefined();
    expect(signals.onPointerDoubleClick).toBeDefined();
    expect(signals.onPointerDown).toBeDefined();
    expect(signals.onPointerMove).toBeDefined();
    expect(signals.onPointerOut).toBeDefined();
    expect(signals.onPointerOver).toBeDefined();
    expect(signals.onPointerRollOut).toBeDefined();
    expect(signals.onPointerRollOver).toBeDefined();
    expect(signals.onPointerUp).toBeDefined();
    expect(signals.onReleaseOutside).toBeDefined();
    expect(signals.onWheel).toBeDefined();
  });

  it('returns a new object each call', () => {
    expect(createInteractionSignals()).not.toBe(createInteractionSignals());
  });
});

describe('disconnectInteractionSignal', () => {
  it('disconnects a tracked subscriber and removes the dispatch cost', () => {
    const kind = 'DisconnectTrackedHitTest';
    const root = createNode(kind);
    setNodeHitTestEnabled(root, true);
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    let fired = 0;
    let hitTests = 0;
    const slot = () => fired++;
    registerHitTest(kind, () => {
      hitTests++;
      return true;
    });

    connectInteractionSignal(manager, root, 'onPointerDown', slot);
    disconnectInteractionSignal(manager, root, 'onPointerDown', slot);
    dispatchInteractionPointerDown(manager, 50, 50);
    expect(fired).toBe(0);
    expect(hitTests).toBe(0);
  });
});

describe('dispatchInteractionContextMenu', () => {
  it('fires onContextMenu on a hit target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onContextMenu, () => fired++);

    dispatchInteractionContextMenu(manager, 50, 50);
    expect(fired).toBe(1);
  });
});

describe('dispatchInteractionKeyDown', () => {
  it('fires onKeyDown on the manager root', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    let received = '';
    connectSignal(enableInteractionSignals(root).onKeyDown, (data) => {
      received = data.key;
    });

    dispatchInteractionKeyDown(manager, 'a', 65);
    expect(received).toBe('a');
  });
});

describe('dispatchInteractionKeyUp', () => {
  it('fires onKeyUp on the manager root', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    let received = 0;
    connectSignal(enableInteractionSignals(root).onKeyUp, (data) => {
      received = data.keyCode;
    });

    dispatchInteractionKeyUp(manager, 'a', 65);
    expect(received).toBe(65);
  });
});

describe('dispatchInteractionPointerCancel', () => {
  it('fires onPointerCancel on the active pointer target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerCancel, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerCancel(manager, 60, 60);
    expect(fired).toBe(1);
  });

  it('clears pointer capture', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerCancel, () => fired++);
    connectSignal(enableInteractionSignals(child).onPointerMove, () => fired++);

    captureInteractionPointer(manager, 3, child);
    dispatchInteractionPointerCancel(manager, 500, 500, { pointerId: 3 });
    dispatchInteractionPointerMove(manager, 500, 500, 0, { pointerId: 3 });
    expect(fired).toBe(1);
  });
});

describe('dispatchInteractionPointerDown', () => {
  it('does not hit test when no dependent signal has subscribers', () => {
    const kind = 'NoSubscriberHitTest';
    const root = createNode(kind);
    const manager = createInteractionManager(root);
    let hitTests = 0;
    registerHitTest(kind, () => {
      hitTests++;
      return true;
    });

    dispatchInteractionPointerDown(manager, 50, 50);
    expect(hitTests).toBe(0);
  });

  it('does not hit test when only unrelated signals have subscribers', () => {
    const kind = 'UnrelatedSubscriberHitTest';
    const root = createNode(kind);
    const manager = createInteractionManager(root);
    let hitTests = 0;
    registerHitTest(kind, () => {
      hitTests++;
      return true;
    });
    connectSignal(enableInteractionSignals(root).onWheel, () => {});

    dispatchInteractionPointerDown(manager, 50, 50);
    expect(hitTests).toBe(0);
  });

  it('does nothing when no hit target is found', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    expect(() => dispatchInteractionPointerDown(manager, 50, 50)).not.toThrow();
  });

  it('does nothing when the manager is disabled', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, child);

    const signals = enableInteractionSignals(child);
    const manager = createInteractionManager(root, { enabled: false });
    let fired = 0;
    connectSignal(signals.onPointerDown, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    expect(fired).toBe(0);
  });

  it('fires onPointerDown on a hit target', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, child);

    const signals = enableInteractionSignals(child);
    const manager = createInteractionManager(root);
    let fired = 0;
    connectSignal(signals.onPointerDown, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('passes correct pointer data to the handler', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, child);

    const signals = enableInteractionSignals(child);
    const manager = createInteractionManager(root);
    let receivedX = 0;
    let receivedY = 0;
    connectSignal(signals.onPointerDown, (data) => {
      receivedX = data.x;
      receivedY = data.y;
    });

    dispatchInteractionPointerDown(manager, 30, 40);
    expect(receivedX).toBe(30);
    expect(receivedY).toBe(40);
  });

  it('passes target, current target, local coordinates, and pointer metadata', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    child.x = 10;
    child.y = 20;
    invalidateNodeLocalTransform(child);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, child);

    const manager = createInteractionManager(root);
    let receivedCurrentTarget = null;
    let receivedLocalX = 0;
    let receivedLocalY = 0;
    let receivedPointerId = 0;
    let receivedPointerType = '';
    let receivedTarget = null;
    connectSignal(enableInteractionSignals(child).onPointerDown, (data) => {
      receivedCurrentTarget = data.currentTarget;
      receivedLocalX = data.localX;
      receivedLocalY = data.localY;
      receivedPointerId = data.pointerId;
      receivedPointerType = data.pointerType;
      receivedTarget = data.target;
    });

    dispatchInteractionPointerDown(manager, 30, 40, 0, { pointerId: 7, pointerType: 'pen' });
    expect(receivedCurrentTarget).toBe(child);
    expect(receivedLocalX).toBe(20);
    expect(receivedLocalY).toBe(20);
    expect(receivedPointerId).toBe(7);
    expect(receivedPointerType).toBe('pen');
    expect(receivedTarget).toBe(child);
  });

  it('passes bubbled target, current target, and ancestor local coordinates', () => {
    const root = createDisplayObject();
    const parent = createDisplayObject();
    const child = createDisplayObject();
    parent.x = 10;
    parent.y = 20;
    invalidateNodeLocalTransform(parent);
    child.x = 5;
    child.y = 7;
    invalidateNodeLocalTransform(child);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, parent);
    addNodeChild(parent, child);

    const manager = createInteractionManager(root);
    let receivedCurrentTarget = null;
    let receivedLocalX = 0;
    let receivedLocalY = 0;
    let receivedTarget = null;
    connectSignal(enableInteractionSignals(parent).onPointerDown, (data) => {
      receivedCurrentTarget = data.currentTarget;
      receivedLocalX = data.localX;
      receivedLocalY = data.localY;
      receivedTarget = data.target;
    });

    dispatchInteractionPointerDown(manager, 25, 37);
    expect(receivedCurrentTarget).toBe(parent);
    expect(receivedLocalX).toBe(15);
    expect(receivedLocalY).toBe(17);
    expect(receivedTarget).toBe(child);
  });

  it('tracks a click target when only onClick is connected', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onClick, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerUp(manager, 50, 50);
    expect(fired).toBe(1);
  });
});

describe('dispatchInteractionPointerMove', () => {
  it('fires onPointerMove on a hit target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerMove, () => fired++);

    dispatchInteractionPointerMove(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('applies the rollover target cursor and clears it on exit — even with no move subscribers', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    setNodeHitTestEnabled(child, true);
    addNodeChild(root, child);
    const applied: (Cursor | null)[] = [];
    const manager = createInteractionManager(root, { cursorBackend: { setCursor: (c) => applied.push(c) } });
    setNodeCursor(child, 'pointer');

    dispatchInteractionPointerMove(manager, 50, 50);
    expect(applied.at(-1)).toBe('pointer');

    dispatchInteractionPointerMove(manager, 500, 500);
    expect(applied.at(-1)).toBeNull();
  });

  it('fires over and roll over when entering a target', () => {
    const { child, manager } = createHitScene3D();
    const order: string[] = [];
    const signals = enableInteractionSignals(child);
    connectSignal(signals.onPointerOver, () => order.push('over'));
    connectSignal(signals.onPointerRollOver, () => order.push('rollOver'));

    dispatchInteractionPointerMove(manager, 50, 50);
    expect(order).toEqual(['rollOver', 'over']);
  });

  it('fires out and roll out when leaving a target', () => {
    const { child, manager } = createHitScene3D();
    const order: string[] = [];
    const signals = enableInteractionSignals(child);
    connectSignal(signals.onPointerOut, () => order.push('out'));
    connectSignal(signals.onPointerRollOut, () => order.push('rollOut'));

    dispatchInteractionPointerMove(manager, 50, 50);
    dispatchInteractionPointerMove(manager, 500, 500);
    expect(order).toEqual(['out', 'rollOut']);
  });
});

describe('dispatchInteractionPointerUp', () => {
  it('fires onPointerUp on a hit target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerUp, () => fired++);

    dispatchInteractionPointerUp(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('fires onClick after down and up on the same target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onClick, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerUp(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('fires onDoubleClick for two clicks within the manager delay', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onDoubleClick, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerUp(manager, 50, 50, 0, 1000);
    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerUp(manager, 50, 50, 0, 1200);
    expect(fired).toBe(1);
  });

  it('tracks double clicks independently by pointer id', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onDoubleClick, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50, 0, { pointerId: 1 });
    dispatchInteractionPointerUp(manager, 50, 50, 0, 1000, { pointerId: 1 });
    dispatchInteractionPointerDown(manager, 50, 50, 0, { pointerId: 2 });
    dispatchInteractionPointerUp(manager, 50, 50, 0, 1200, { pointerId: 2 });
    dispatchInteractionPointerDown(manager, 50, 50, 0, { pointerId: 1 });
    dispatchInteractionPointerUp(manager, 50, 50, 0, 1300, { pointerId: 1 });
    expect(fired).toBe(1);
  });

  it('fires an opted-in pointer double click at the inclusive timing and distance boundaries', () => {
    const { child, manager } = createHitScene3D({ doubleClickDelay: 100, doubleClickDistance: 5 });
    const order: string[] = [];
    const signals = enableInteractionSignals(child);
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(signals.onPointerDown, () => order.push('down'));
    connectSignal(signals.onPointerUp, () => order.push('up'));
    connectSignal(signals.onClick, () => order.push('click'));
    connectSignal(signals.onPointerDoubleClick, () => order.push('doubleClick'));

    dispatchInteractionPointerDown(manager, 20, 20, 0, { timeStamp: 1000 });
    dispatchInteractionPointerUp(manager, 20, 20, 0, 1000);
    dispatchInteractionPointerDown(manager, 23, 24, 0, { timeStamp: 1100 });
    dispatchInteractionPointerUp(manager, 23, 24, 0, 1100);

    expect(order).toEqual(['down', 'up', 'click', 'down', 'up', 'click', 'doubleClick']);
  });

  it('does not fire after the timing boundary, and treats that click as a new first click', () => {
    const { child, manager } = createHitScene3D({ doubleClickDelay: 100 });
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    dispatchClick(manager, 50, 50, 1101);
    expect(fired).toBe(0);
    dispatchClick(manager, 50, 50, 1201);
    expect(fired).toBe(1);
  });

  it('does not fire beyond the distance boundary', () => {
    const { child, manager } = createHitScene3D({ doubleClickDelay: 100, doubleClickDistance: 5 });
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 20, 20, 1000);
    dispatchClick(manager, 26, 20, 1050);
    expect(fired).toBe(0);
  });

  it('does not pair clicks across different targets or intervening clicks', () => {
    const { first, manager, second } = createTwoTargetScene();
    let fired = 0;
    setNodePointerDoubleClickEnabled(first, true);
    setNodePointerDoubleClickEnabled(second, true);
    connectSignal(enableInteractionSignals(first).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    dispatchClick(manager, 200, 50, 1100);
    dispatchClick(manager, 50, 50, 1200);
    expect(fired).toBe(0);
  });

  it('does not fire until the target opts in', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    dispatchClick(manager, 50, 50, 1100);
    expect(fired).toBe(0);

    setNodePointerDoubleClickEnabled(child, true);
    dispatchClick(manager, 50, 50, 1200);
    dispatchClick(manager, 50, 50, 1300);
    expect(fired).toBe(1);
  });

  it('resets when the target opts out between clicks', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    setNodePointerDoubleClickEnabled(child, false);
    dispatchClick(manager, 50, 50, 1100);
    setNodePointerDoubleClickEnabled(child, true);
    dispatchClick(manager, 50, 50, 1200);
    expect(fired).toBe(0);
  });

  it('does not carry a pending click across target disposal', () => {
    const { child, manager, root } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    disposeNode(child);
    setNodeHitTestEnabled(child, true);
    setNodePointerDoubleClickEnabled(child, true);
    addNodeChild(root, child);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);
    dispatchClick(manager, 50, 50, 1100);
    expect(fired).toBe(0);
  });

  it('resets after pointer movement exceeds the distance threshold', () => {
    const { child, manager } = createHitScene3D({ doubleClickDistance: 5 });
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 20, 20, 1000);
    dispatchInteractionPointerMove(manager, 40, 20, 0, { timeStamp: 1050 });
    dispatchClick(manager, 20, 20, 1100);
    expect(fired).toBe(0);
  });

  it('resets when the pointer moves to another target', () => {
    const { first, manager, second } = createTwoTargetScene();
    let fired = 0;
    setNodePointerDoubleClickEnabled(first, true);
    setNodePointerDoubleClickEnabled(second, true);
    connectSignal(enableInteractionSignals(first).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    dispatchInteractionPointerMove(manager, 200, 50, 0, { timeStamp: 1050 });
    dispatchClick(manager, 50, 50, 1100);
    expect(fired).toBe(0);
  });

  it('resets on pointer cancellation even without cancel subscribers', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    dispatchInteractionPointerCancel(manager, 50, 50, { timeStamp: 1050 });
    dispatchClick(manager, 50, 50, 1100);
    expect(fired).toBe(0);
  });

  it('resets when an interaction is attempted while the manager is disabled', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    manager.enabled = false;
    dispatchClick(manager, 50, 50, 1050);
    manager.enabled = true;
    dispatchClick(manager, 50, 50, 1100);
    expect(fired).toBe(0);
  });

  it('fires only once in a triple-click sequence', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    dispatchClick(manager, 50, 50, 1100);
    dispatchClick(manager, 50, 50, 1200);
    expect(fired).toBe(1);
  });

  it('fires onReleaseOutside on the original down target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onReleaseOutside, () => fired++);

    dispatchInteractionPointerDown(manager, 50, 50);
    dispatchInteractionPointerUp(manager, 500, 500);
    expect(fired).toBe(1);
  });
});

describe('dispatchInteractionWheel', () => {
  it('fires onWheel with delta values', () => {
    const { child, manager } = createHitScene3D();
    let receivedDeltaY = 0;
    connectSignal(enableInteractionSignals(child).onWheel, (data) => {
      receivedDeltaY = data.deltaY;
    });

    dispatchInteractionWheel(manager, 50, 50, 0, -120);
    expect(receivedDeltaY).toBe(-120);
  });
});

describe('enableInteractionSignals', () => {
  it('creates and returns interaction signals on first call', () => {
    const obj = createDisplayObject();
    const signals = enableInteractionSignals(obj);
    expect(signals).toBeDefined();
    expect(signals.onPointerDown).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const obj = createDisplayObject();
    expect(enableInteractionSignals(obj)).toBe(enableInteractionSignals(obj));
  });

  it('makes getInteractionSignals return the enabled object', () => {
    const obj = createDisplayObject();
    const signals = enableInteractionSignals(obj);
    expect(getInteractionSignals(obj)).toBe(signals);
  });
});

describe('getInteractionSignals', () => {
  it('returns null before signals are enabled', () => {
    const obj = createDisplayObject();
    expect(getInteractionSignals(obj)).toBeNull();
  });

  it('returns the signals after enableInteractionSignals', () => {
    const obj = createDisplayObject();
    const signals = enableInteractionSignals(obj);
    expect(getInteractionSignals(obj)).toBe(signals);
  });
});

describe('invalidateInteractionCursor', () => {
  it('applies a cursor written to the current rollover target only when explicitly invalidated', () => {
    const { applied, child, manager } = createCursorScene();

    setNodeCursor(child, 'pointer');
    expect(applied).toEqual([]);
    invalidateInteractionCursor(manager);

    expect(applied).toEqual(['pointer']);
  });

  it('re-resolves a cursor written to an ancestor of the current rollover target', () => {
    const { applied, manager, root } = createCursorScene();

    setNodeCursor(root, 'grab');
    invalidateInteractionCursor(manager);

    expect(applied).toEqual(['grab']);
  });

  it('keeps the current cursor when an unrelated node changes', () => {
    const { applied, child, manager, unrelated } = createCursorScene('pointer');

    setNodeCursor(unrelated, 'grab');
    invalidateInteractionCursor(manager);

    expect(applied).toEqual(['pointer']);
    expect(child).not.toBe(unrelated);
  });

  it('clears the backend when the current rollover target cursor is cleared', () => {
    const { applied, child, manager } = createCursorScene('pointer');

    setNodeCursor(child, null);
    invalidateInteractionCursor(manager);

    expect(applied).toEqual([null]);
  });

  it('is idempotent when invalidated repeatedly without another data change', () => {
    const { applied, manager } = createCursorScene('pointer');

    invalidateInteractionCursor(manager);
    invalidateInteractionCursor(manager);

    expect(applied).toEqual(['pointer', 'pointer']);
  });
});

describe('releaseInteractionPointer', () => {
  it('stops routing pointer events to the captured target', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    connectSignal(enableInteractionSignals(child).onPointerMove, () => fired++);

    captureInteractionPointer(manager, 3, child);
    releaseInteractionPointer(manager, 3);
    dispatchInteractionPointerMove(manager, 500, 500, 0, { pointerId: 3 });
    expect(fired).toBe(0);
  });

  it('resets a pending pointer double click', () => {
    const { child, manager } = createHitScene3D();
    let fired = 0;
    setNodePointerDoubleClickEnabled(child, true);
    connectSignal(enableInteractionSignals(child).onPointerDoubleClick, () => fired++);

    dispatchClick(manager, 50, 50, 1000);
    releaseInteractionPointer(manager, 0);
    dispatchClick(manager, 50, 50, 1100);
    expect(fired).toBe(0);
  });
});

describe('setInteractionConnectGuard', () => {
  it('invokes the installed guard when a signal is connected, and stops after null', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    const seen: string[] = [];
    setInteractionConnectGuard((target, name) => {
      void target;
      seen.push(name);
    });
    connectInteractionSignal(manager, root, 'onPointerDown', () => {});
    setInteractionConnectGuard(null);
    connectInteractionSignal(manager, root, 'onPointerUp', () => {});
    expect(seen).toEqual(['onPointerDown']);
  });
});

function createHitScene3D(options: Readonly<InteractionManagerOptions> = {}) {
  const root = createDisplayObject();
  const child = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
  setNodeHitTestEnabled(child, true);
  addNodeChild(root, child);
  return { child, manager: createInteractionManager(root, options), root };
}

function createTwoTargetScene() {
  const root = createDisplayObject();
  const first = createDisplayObject();
  const second = createDisplayObject();
  second.x = 150;
  invalidateNodeLocalTransform(second);
  setRectangle(getNodeLocalBoundsRectangle(first), 0, 0, 100, 100);
  setRectangle(getNodeLocalBoundsRectangle(second), 0, 0, 100, 100);
  setNodeHitTestEnabled(first, true);
  setNodeHitTestEnabled(second, true);
  addNodeChild(root, first);
  addNodeChild(root, second);
  return { first, manager: createInteractionManager(root), root, second };
}

function createCursorScene(cursor: Cursor | null = null) {
  const root = createDisplayObject();
  const child = createDisplayObject();
  const unrelated = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
  setNodeHitTestEnabled(child, true);
  setNodeCursor(child, cursor);
  addNodeChild(root, child);
  addNodeChild(root, unrelated);
  const applied: (Cursor | null)[] = [];
  const manager = createInteractionManager(root, { cursorBackend: { setCursor: (value) => applied.push(value) } });
  dispatchInteractionPointerMove(manager, 50, 50);
  applied.length = 0;
  return { applied, child, manager, root, unrelated };
}

function createInputKeyboardData(key: string, keyCode: number): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: key,
    ctrlKey: false,
    key,
    keyCode,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: false,
    timeStamp: 0,
  };
}

function createInputPointerData(x: number, y: number, timeStamp: number = 0): InputPointerData {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    ctrlKey: false,
    deltaX: 0,
    deltaY: 0,
    height: 1,
    isPrimary: true,
    metaKey: false,
    pointerId: 0,
    pointerType: 'mouse',
    pressure: 0,
    shiftKey: false,
    tiltX: 0,
    tiltY: 0,
    timeStamp,
    twist: 0,
    wheelMode: 'unknown',
    width: 1,
    x,
    y,
  };
}

function dispatchClick(
  manager: ReturnType<typeof createHitScene3D>['manager'],
  x: number,
  y: number,
  timeStamp: number,
): void {
  dispatchInteractionPointerDown(manager, x, y, 0, { timeStamp });
  dispatchInteractionPointerUp(manager, x, y, 0, timeStamp);
}

function createInputSource(): InputSignals {
  return {
    onGamepadAxisMove: createSignal(),
    onGamepadButtonDown: createSignal(),
    onGamepadButtonUp: createSignal(),
    onGamepadConnect: createSignal(),
    onGamepadDisconnect: createSignal(),
    onKeyDown: createSignal(),
    onKeyUp: createSignal(),
    onPointerCancel: createSignal(),
    onPointerDown: createSignal(),
    onPointerMove: createSignal(),
    onPointerMoveRelative: createSignal(),
    onPointerUp: createSignal(),
    onTextEdit: createSignal(),
    onTextInput: createSignal(),
    onWheel: createSignal(),
  };
}
