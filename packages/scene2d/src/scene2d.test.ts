import { addNodeChild } from '@flighthq/node/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { Scene2D } from '@flighthq/types/contract';

import { createDisplayObject } from './displayObject';
import {
  createScene2D,
  createScene2DRuntime,
  createScene2DSignals,
  enableScene2DSignals,
  getScene2DRoot,
  getScene2DRuntime,
  getScene2DSignals,
  initializeScene2D,
  initializeScene2DSignals,
  setScene2DSize,
} from './scene2d';

describe('createScene2D', () => {
  let scene2d: Scene2D;

  beforeEach(() => {
    scene2d = createScene2D();
  });

  it('initializes default values', () => {
    expect(scene2d.color).toBe(null);
    expect(scene2d.scene2dHeight).toBe(550);
    expect(scene2d.scene2dWidth).toBe(400);
    expect(scene2d.align).toBe('topleft');
    expect(scene2d.scaleMode).toBe('noscale');
  });

  it('allocates a display-object root the scene2d points back to', () => {
    expect(scene2d.root).toBeDefined();
    expect(getScene2DRoot(scene2d.root)).toBe(scene2d);
  });

  it('allows pre-defined values', () => {
    const obj = createScene2D({ color: 0xff0000ff, scene2dHeight: 1000, scene2dWidth: 2000 });
    expect(obj.color).toStrictEqual(0xff0000ff);
    expect(obj.scene2dHeight).toStrictEqual(1000);
    expect(obj.scene2dWidth).toStrictEqual(2000);
  });
});

describe('createScene2DRuntime', () => {
  it('returns a non-null runtime with scene2dSignals initialized to null', () => {
    const runtime = createScene2DRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime.scene2dSignals).toBeNull();
  });
});

describe('createScene2DSignals', () => {
  it('returns an object with all signal properties', () => {
    const signals = createScene2DSignals();
    expect(signals.onResize).toBeDefined();
    expect(signals.onFullscreenChanged).toBeDefined();
    expect(signals.onOrientationChanged).toBeDefined();
  });
});

describe('enableScene2DSignals', () => {
  it('creates and returns signals on first call', () => {
    const scene2d = createScene2D();
    const signals = enableScene2DSignals(scene2d);
    expect(signals).toBeDefined();
    expect(signals.onResize).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const scene2d = createScene2D();
    expect(enableScene2DSignals(scene2d)).toBe(enableScene2DSignals(scene2d));
  });

  it('makes getScene2DSignals return the enabled object', () => {
    const scene2d = createScene2D();
    const signals = enableScene2DSignals(scene2d);
    expect(getScene2DSignals(scene2d)).toBe(signals);
  });
});

describe('getScene2DRoot', () => {
  it('returns null when the node has no parent', () => {
    const obj = createDisplayObject();
    expect(getScene2DRoot(obj)).toBeNull();
  });

  it('returns null when the root is not owned by a Scene2D', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    expect(getScene2DRoot(child)).toBeNull();
  });

  it('returns the Scene2D when a child is added under its root', () => {
    const scene2d = createScene2D();
    const child = createDisplayObject();
    addNodeChild(scene2d.root, child);
    expect(getScene2DRoot(child)).toBe(scene2d);
  });

  it('returns the Scene2D from a deeply nested node', () => {
    const scene2d = createScene2D();
    const mid = createDisplayObject();
    const leaf = createDisplayObject();
    addNodeChild(scene2d.root, mid);
    addNodeChild(mid, leaf);
    expect(getScene2DRoot(leaf)).toBe(scene2d);
  });
});

describe('getScene2DRuntime', () => {
  it('returns the runtime for a Scene2D', () => {
    const scene2d = createScene2D();
    const runtime = getScene2DRuntime(scene2d);
    expect(runtime).not.toBeNull();
  });
});

describe('getScene2DSignals', () => {
  it('returns null before signals are enabled', () => {
    const scene2d = createScene2D();
    expect(getScene2DSignals(scene2d)).toBeNull();
  });

  it('returns the signals after enableScene2DSignals', () => {
    const scene2d = createScene2D();
    const signals = enableScene2DSignals(scene2d);
    expect(getScene2DSignals(scene2d)).toBe(signals);
  });
});

describe('initializeScene2D', () => {
  it('is the construction initializer of createScene2D', () => {
    expect(typeof initializeScene2D).toBe('function');
  });
});
describe('initializeScene2DSignals', () => {
  it('is the construction initializer of createScene2DSignals', () => {
    expect(typeof initializeScene2DSignals).toBe('function');
  });
});

describe('setScene2DSize', () => {
  it('updates scene2dWidth and scene2dHeight', () => {
    const scene2d = createScene2D();
    setScene2DSize(scene2d, 1920, 1080);
    expect(scene2d.scene2dWidth).toBe(1920);
    expect(scene2d.scene2dHeight).toBe(1080);
  });

  it('emits onResize when dimensions change', () => {
    const scene2d = createScene2D();
    let called = false;
    connectSignal(enableScene2DSignals(scene2d).onResize, () => {
      called = true;
    });
    setScene2DSize(scene2d, 1280, 720);
    expect(called).toBe(true);
  });

  it('does not emit onResize when dimensions are unchanged', () => {
    const scene2d = createScene2D({ scene2dWidth: 400, scene2dHeight: 300 });
    let called = false;
    connectSignal(enableScene2DSignals(scene2d).onResize, () => {
      called = true;
    });
    setScene2DSize(scene2d, 400, 300);
    expect(called).toBe(false);
  });

  it('does not emit onResize when no one has subscribed', () => {
    const scene2d = createScene2D();
    expect(() => setScene2DSize(scene2d, 1280, 720)).not.toThrow();
  });
});
