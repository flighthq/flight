import { setRectangle } from '@flighthq/geometry';
import { addSceneChild, createSceneNode, getLocalBoundsRectangle, invalidateLocalTransform } from '@flighthq/scene';
import { createDisplayObject } from '@flighthq/scene-display';
import { connectSignal, createSignal, emitSignal } from '@flighthq/signals';
import type { InputKeyboardData, InputPointerData, InputSignals } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { graphHitTestLocalBounds } from './hitTests';
import { registerHitTestPoint } from './hitTests';
import {
  capturePointer,
  connectInputToInteraction,
  connectInteractionSignal,
  createInteractionManager,
  createInteractionSignals,
  disconnectInteractionSignal,
  dispatchContextMenu,
  dispatchKeyDown,
  dispatchKeyUp,
  dispatchPointerCancel,
  dispatchPointerDown,
  dispatchPointerMove,
  dispatchPointerUp,
  dispatchWheel,
  getInteractionSignals,
  releasePointer,
} from './interactionManager';

beforeAll(() => {
  registerHitTestPoint(DisplayObjectKind, graphHitTestLocalBounds);
});

describe('capturePointer', () => {
  it('routes pointer events to the captured target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerMove, () => fired++);

    capturePointer(manager, 3, child);
    dispatchPointerMove(manager, 500, 500, 0, { pointerId: 3 });
    expect(fired).toBe(1);
  });
});

describe('connectInputToInteraction', () => {
  it('routes normalized input signals into interaction dispatch', () => {
    const input = createInputSource();
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerDown, () => fired++);

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
    connectSignal(getInteractionSignals(root).onKeyDown, (data) => {
      received = data.key;
    });

    connectInputToInteraction(input, manager);
    emitSignal(input.onKeyDown, createInputKeyboardData('a', 97));
    expect(received).toBe('a');
  });
});

describe('connectInteractionSignal', () => {
  it('can use tracked subscribers without scanning for direct signal connections', () => {
    const kind = Symbol('TrackedSubscriberHitTest');
    const root = createSceneNode(Symbol('Graph'), kind);
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    let fired = 0;
    let hitTests = 0;
    registerHitTestPoint(kind, () => {
      hitTests++;
      return true;
    });

    connectSignal(getInteractionSignals(root).onPointerDown, () => fired++);
    dispatchPointerDown(manager, 50, 50);
    expect(fired).toBe(0);
    expect(hitTests).toBe(0);

    connectInteractionSignal(manager, root, 'onPointerDown', () => fired++);
    dispatchPointerDown(manager, 50, 50);
    expect(fired).toBe(2);
    expect(hitTests).toBe(1);
  });

  it('clears tracked once subscribers after dispatch', () => {
    const kind = Symbol('TrackedOnceHitTest');
    const root = createSceneNode(Symbol('Graph'), kind);
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    let fired = 0;
    let hitTests = 0;
    registerHitTestPoint(kind, () => {
      hitTests++;
      return true;
    });

    connectInteractionSignal(manager, root, 'onPointerDown', () => fired++, { once: true });
    dispatchPointerDown(manager, 50, 50);
    dispatchPointerDown(manager, 50, 50);
    expect(fired).toBe(1);
    expect(hitTests).toBe(1);
  });
});

describe('createInteractionManager', () => {
  it('creates an enabled manager by default', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    expect(manager.enabled).toBe(true);
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
    const kind = Symbol('DisconnectTrackedHitTest');
    const root = createSceneNode(Symbol('Graph'), kind);
    const manager = createInteractionManager(root, { trackedSubscribersOnly: true });
    let fired = 0;
    let hitTests = 0;
    const slot = () => fired++;
    registerHitTestPoint(kind, () => {
      hitTests++;
      return true;
    });

    connectInteractionSignal(manager, root, 'onPointerDown', slot);
    disconnectInteractionSignal(manager, root, 'onPointerDown', slot);
    dispatchPointerDown(manager, 50, 50);
    expect(fired).toBe(0);
    expect(hitTests).toBe(0);
  });
});

describe('dispatchContextMenu', () => {
  it('fires onContextMenu on a hit target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onContextMenu, () => fired++);

    dispatchContextMenu(manager, 50, 50);
    expect(fired).toBe(1);
  });
});

describe('dispatchKeyDown', () => {
  it('fires onKeyDown on the manager root', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    let received = '';
    connectSignal(getInteractionSignals(root).onKeyDown, (data) => {
      received = data.key;
    });

    dispatchKeyDown(manager, 'a', 65);
    expect(received).toBe('a');
  });
});

describe('dispatchKeyUp', () => {
  it('fires onKeyUp on the manager root', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    let received = 0;
    connectSignal(getInteractionSignals(root).onKeyUp, (data) => {
      received = data.keyCode;
    });

    dispatchKeyUp(manager, 'a', 65);
    expect(received).toBe(65);
  });
});

describe('dispatchPointerCancel', () => {
  it('fires onPointerCancel on the active pointer target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerCancel, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    dispatchPointerCancel(manager, 60, 60);
    expect(fired).toBe(1);
  });

  it('clears pointer capture', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerCancel, () => fired++);
    connectSignal(getInteractionSignals(child).onPointerMove, () => fired++);

    capturePointer(manager, 3, child);
    dispatchPointerCancel(manager, 500, 500, { pointerId: 3 });
    dispatchPointerMove(manager, 500, 500, 0, { pointerId: 3 });
    expect(fired).toBe(1);
  });
});

describe('dispatchPointerDown', () => {
  it('does not hit test when no dependent signal has subscribers', () => {
    const kind = Symbol('NoSubscriberHitTest');
    const root = createSceneNode(Symbol('Graph'), kind);
    const manager = createInteractionManager(root);
    let hitTests = 0;
    registerHitTestPoint(kind, () => {
      hitTests++;
      return true;
    });

    dispatchPointerDown(manager, 50, 50);
    expect(hitTests).toBe(0);
  });

  it('does not hit test when only unrelated signals have subscribers', () => {
    const kind = Symbol('UnrelatedSubscriberHitTest');
    const root = createSceneNode(Symbol('Graph'), kind);
    const manager = createInteractionManager(root);
    let hitTests = 0;
    registerHitTestPoint(kind, () => {
      hitTests++;
      return true;
    });
    connectSignal(getInteractionSignals(root).onWheel, () => {});

    dispatchPointerDown(manager, 50, 50);
    expect(hitTests).toBe(0);
  });

  it('does nothing when no hit target is found', () => {
    const root = createDisplayObject();
    const manager = createInteractionManager(root);
    expect(() => dispatchPointerDown(manager, 50, 50)).not.toThrow();
  });

  it('does nothing when the manager is disabled', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(root, child);

    const signals = getInteractionSignals(child);
    const manager = createInteractionManager(root, { enabled: false });
    let fired = 0;
    connectSignal(signals.onPointerDown, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    expect(fired).toBe(0);
  });

  it('fires onPointerDown on a hit target', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(root, child);

    const signals = getInteractionSignals(child);
    const manager = createInteractionManager(root);
    let fired = 0;
    connectSignal(signals.onPointerDown, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('passes correct pointer data to the handler', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(root, child);

    const signals = getInteractionSignals(child);
    const manager = createInteractionManager(root);
    let receivedX = 0;
    let receivedY = 0;
    connectSignal(signals.onPointerDown, (data) => {
      receivedX = data.x;
      receivedY = data.y;
    });

    dispatchPointerDown(manager, 30, 40);
    expect(receivedX).toBe(30);
    expect(receivedY).toBe(40);
  });

  it('passes target, current target, local coordinates, and pointer metadata', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    child.x = 10;
    child.y = 20;
    invalidateLocalTransform(child);
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(root, child);

    const manager = createInteractionManager(root);
    let receivedCurrentTarget = null;
    let receivedLocalX = 0;
    let receivedLocalY = 0;
    let receivedPointerId = 0;
    let receivedPointerType = '';
    let receivedTarget = null;
    connectSignal(getInteractionSignals(child).onPointerDown, (data) => {
      receivedCurrentTarget = data.currentTarget;
      receivedLocalX = data.localX;
      receivedLocalY = data.localY;
      receivedPointerId = data.pointerId;
      receivedPointerType = data.pointerType;
      receivedTarget = data.target;
    });

    dispatchPointerDown(manager, 30, 40, 0, { pointerId: 7, pointerType: 'pen' });
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
    invalidateLocalTransform(parent);
    child.x = 5;
    child.y = 7;
    invalidateLocalTransform(child);
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(root, parent);
    addSceneChild(parent, child);

    const manager = createInteractionManager(root);
    let receivedCurrentTarget = null;
    let receivedLocalX = 0;
    let receivedLocalY = 0;
    let receivedTarget = null;
    connectSignal(getInteractionSignals(parent).onPointerDown, (data) => {
      receivedCurrentTarget = data.currentTarget;
      receivedLocalX = data.localX;
      receivedLocalY = data.localY;
      receivedTarget = data.target;
    });

    dispatchPointerDown(manager, 25, 37);
    expect(receivedCurrentTarget).toBe(parent);
    expect(receivedLocalX).toBe(15);
    expect(receivedLocalY).toBe(17);
    expect(receivedTarget).toBe(child);
  });

  it('tracks a click target when only onClick is connected', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onClick, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    dispatchPointerUp(manager, 50, 50);
    expect(fired).toBe(1);
  });
});

describe('dispatchPointerMove', () => {
  it('fires onPointerMove on a hit target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerMove, () => fired++);

    dispatchPointerMove(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('fires over and roll over when entering a target', () => {
    const { child, manager } = createHitScene();
    const order: string[] = [];
    const signals = getInteractionSignals(child);
    connectSignal(signals.onPointerOver, () => order.push('over'));
    connectSignal(signals.onPointerRollOver, () => order.push('rollOver'));

    dispatchPointerMove(manager, 50, 50);
    expect(order).toEqual(['rollOver', 'over']);
  });

  it('fires out and roll out when leaving a target', () => {
    const { child, manager } = createHitScene();
    const order: string[] = [];
    const signals = getInteractionSignals(child);
    connectSignal(signals.onPointerOut, () => order.push('out'));
    connectSignal(signals.onPointerRollOut, () => order.push('rollOut'));

    dispatchPointerMove(manager, 50, 50);
    dispatchPointerMove(manager, 500, 500);
    expect(order).toEqual(['out', 'rollOut']);
  });
});

describe('dispatchPointerUp', () => {
  it('fires onPointerUp on a hit target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerUp, () => fired++);

    dispatchPointerUp(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('fires onClick after down and up on the same target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onClick, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    dispatchPointerUp(manager, 50, 50);
    expect(fired).toBe(1);
  });

  it('fires onDoubleClick for two clicks within the manager delay', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onDoubleClick, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    dispatchPointerUp(manager, 50, 50, 0, 1000);
    dispatchPointerDown(manager, 50, 50);
    dispatchPointerUp(manager, 50, 50, 0, 1200);
    expect(fired).toBe(1);
  });

  it('tracks double clicks independently by pointer id', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onDoubleClick, () => fired++);

    dispatchPointerDown(manager, 50, 50, 0, { pointerId: 1 });
    dispatchPointerUp(manager, 50, 50, 0, 1000, { pointerId: 1 });
    dispatchPointerDown(manager, 50, 50, 0, { pointerId: 2 });
    dispatchPointerUp(manager, 50, 50, 0, 1200, { pointerId: 2 });
    dispatchPointerDown(manager, 50, 50, 0, { pointerId: 1 });
    dispatchPointerUp(manager, 50, 50, 0, 1300, { pointerId: 1 });
    expect(fired).toBe(1);
  });

  it('fires onReleaseOutside on the original down target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onReleaseOutside, () => fired++);

    dispatchPointerDown(manager, 50, 50);
    dispatchPointerUp(manager, 500, 500);
    expect(fired).toBe(1);
  });
});

describe('dispatchWheel', () => {
  it('fires onWheel with delta values', () => {
    const { child, manager } = createHitScene();
    let receivedDeltaY = 0;
    connectSignal(getInteractionSignals(child).onWheel, (data) => {
      receivedDeltaY = data.deltaY;
    });

    dispatchWheel(manager, 50, 50, 0, -120);
    expect(receivedDeltaY).toBe(-120);
  });
});

describe('getInteractionSignals', () => {
  it('lazily creates interaction signals on the runtime', () => {
    const obj = createDisplayObject();
    const signals = getInteractionSignals(obj);
    expect(signals).toBeDefined();
    expect(signals.onPointerDown).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const obj = createDisplayObject();
    expect(getInteractionSignals(obj)).toBe(getInteractionSignals(obj));
  });
});

describe('releasePointer', () => {
  it('stops routing pointer events to the captured target', () => {
    const { child, manager } = createHitScene();
    let fired = 0;
    connectSignal(getInteractionSignals(child).onPointerMove, () => fired++);

    capturePointer(manager, 3, child);
    releasePointer(manager, 3);
    dispatchPointerMove(manager, 500, 500, 0, { pointerId: 3 });
    expect(fired).toBe(0);
  });
});

function createHitScene() {
  const root = createDisplayObject();
  const child = createDisplayObject();
  setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
  addSceneChild(root, child);
  return { child, manager: createInteractionManager(root), root };
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
  };
}

function createInputPointerData(x: number, y: number): InputPointerData {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    ctrlKey: false,
    deltaX: 0,
    deltaY: 0,
    isPrimary: true,
    metaKey: false,
    pointerId: 0,
    pointerType: 'mouse',
    shiftKey: false,
    wheelMode: 'unknown',
    x,
    y,
  };
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
