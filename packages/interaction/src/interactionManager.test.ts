import { setRectangle } from '@flighthq/geometry';
import { addChild, getLocalBoundsRect } from '@flighthq/scenegraph-core';
import { createDisplayObject } from '@flighthq/scenegraph-display';
import { connectSignal } from '@flighthq/signals';
import { DisplayObjectKind } from '@flighthq/types';

import { hitTestLocalBoundsRect } from './hitTests';
import { registerHitTestPoint } from './hitTests';
import {
  createDisplayObjectInteractionSignals,
  dispatchPointerDown,
  getDisplayObjectInteractionSignals,
} from './interactionManager';

beforeAll(() => {
  registerHitTestPoint(DisplayObjectKind, hitTestLocalBoundsRect);
});

describe('createDisplayObjectInteractionSignals', () => {
  it('returns an object with onPointerDown signal', () => {
    const signals = createDisplayObjectInteractionSignals();
    expect(signals.onPointerDown).toBeDefined();
  });

  it('returns a new object each call', () => {
    expect(createDisplayObjectInteractionSignals()).not.toBe(createDisplayObjectInteractionSignals());
  });
});

describe('dispatchPointerDown', () => {
  it('does nothing when no hit target is found', () => {
    const root = createDisplayObject();
    expect(() => dispatchPointerDown(root, 50, 50)).not.toThrow();
  });

  it('fires onPointerDown on a hit target', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getLocalBoundsRect(child), 0, 0, 100, 100);
    addChild(root, child);

    const signals = getDisplayObjectInteractionSignals(child);
    let fired = 0;
    connectSignal(signals.onPointerDown, () => fired++);

    dispatchPointerDown(root, 50, 50);
    expect(fired).toBe(1);
  });

  it('passes correct pointer data to the handler', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    setRectangle(getLocalBoundsRect(child), 0, 0, 100, 100);
    addChild(root, child);

    const signals = getDisplayObjectInteractionSignals(child);
    let receivedX = 0;
    let receivedY = 0;
    connectSignal(signals.onPointerDown, (data) => {
      receivedX = data.x;
      receivedY = data.y;
    });

    dispatchPointerDown(root, 30, 40);
    expect(receivedX).toBe(30);
    expect(receivedY).toBe(40);
  });
});

describe('getDisplayObjectInteractionSignals', () => {
  it('lazily creates interaction signals on the runtime', () => {
    const obj = createDisplayObject();
    const signals = getDisplayObjectInteractionSignals(obj);
    expect(signals).toBeDefined();
    expect(signals.onPointerDown).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const obj = createDisplayObject();
    expect(getDisplayObjectInteractionSignals(obj)).toBe(getDisplayObjectInteractionSignals(obj));
  });
});
