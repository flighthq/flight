import { addNodeChild } from '@flighthq/node';
import { connectSignal } from '@flighthq/signals';
import type { Stage } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import {
  createStage,
  createStageRuntime,
  createStageSignals,
  enableStageSignals,
  getDisplayObjectStage,
  getStageRuntime,
  getStageSignals,
  setStageSize,
} from './stage';

describe('createStage', () => {
  let stage: Stage;

  beforeEach(() => {
    stage = createStage();
  });

  it('initializes default values', () => {
    expect(stage.color).toBe(null);
    expect(stage.stageHeight).toBe(550);
    expect(stage.stageWidth).toBe(400);
    expect(stage.align).toBe('topleft');
    expect(stage.scaleMode).toBe('noscale');
  });

  it('allocates a display-object root the stage points back to', () => {
    expect(stage.root).toBeDefined();
    expect(getDisplayObjectStage(stage.root)).toBe(stage);
  });

  it('allows pre-defined values', () => {
    const obj = createStage({ color: 0xff0000ff, stageHeight: 1000, stageWidth: 2000 });
    expect(obj.color).toStrictEqual(0xff0000ff);
    expect(obj.stageHeight).toStrictEqual(1000);
    expect(obj.stageWidth).toStrictEqual(2000);
  });
});

describe('createStageRuntime', () => {
  it('returns a non-null runtime with stageSignals initialized to null', () => {
    const runtime = createStageRuntime();
    expect(runtime).not.toBeNull();
    expect(runtime.stageSignals).toBeNull();
  });
});

describe('createStageSignals', () => {
  it('returns an object with all signal properties', () => {
    const signals = createStageSignals();
    expect(signals.onResize).toBeDefined();
    expect(signals.onFullscreenChanged).toBeDefined();
    expect(signals.onOrientationChanged).toBeDefined();
  });
});

describe('enableStageSignals', () => {
  it('creates and returns signals on first call', () => {
    const stage = createStage();
    const signals = enableStageSignals(stage);
    expect(signals).toBeDefined();
    expect(signals.onResize).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const stage = createStage();
    expect(enableStageSignals(stage)).toBe(enableStageSignals(stage));
  });

  it('makes getStageSignals return the enabled object', () => {
    const stage = createStage();
    const signals = enableStageSignals(stage);
    expect(getStageSignals(stage)).toBe(signals);
  });
});

describe('getDisplayObjectStage', () => {
  it('returns null when the node has no parent', () => {
    const obj = createDisplayObject();
    expect(getDisplayObjectStage(obj)).toBeNull();
  });

  it('returns null when the root is not owned by a Stage', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    expect(getDisplayObjectStage(child)).toBeNull();
  });

  it('returns the Stage when a child is added under its root', () => {
    const stage = createStage();
    const child = createDisplayObject();
    addNodeChild(stage.root, child);
    expect(getDisplayObjectStage(child)).toBe(stage);
  });

  it('returns the Stage from a deeply nested node', () => {
    const stage = createStage();
    const mid = createDisplayObject();
    const leaf = createDisplayObject();
    addNodeChild(stage.root, mid);
    addNodeChild(mid, leaf);
    expect(getDisplayObjectStage(leaf)).toBe(stage);
  });
});

describe('getStageRuntime', () => {
  it('returns the runtime for a Stage', () => {
    const stage = createStage();
    const runtime = getStageRuntime(stage);
    expect(runtime).not.toBeNull();
  });
});

describe('getStageSignals', () => {
  it('returns null before signals are enabled', () => {
    const stage = createStage();
    expect(getStageSignals(stage)).toBeNull();
  });

  it('returns the signals after enableStageSignals', () => {
    const stage = createStage();
    const signals = enableStageSignals(stage);
    expect(getStageSignals(stage)).toBe(signals);
  });
});

describe('setStageSize', () => {
  it('updates stageWidth and stageHeight', () => {
    const stage = createStage();
    setStageSize(stage, 1920, 1080);
    expect(stage.stageWidth).toBe(1920);
    expect(stage.stageHeight).toBe(1080);
  });

  it('emits onResize when dimensions change', () => {
    const stage = createStage();
    let called = false;
    connectSignal(enableStageSignals(stage).onResize, () => {
      called = true;
    });
    setStageSize(stage, 1280, 720);
    expect(called).toBe(true);
  });

  it('does not emit onResize when dimensions are unchanged', () => {
    const stage = createStage({ stageWidth: 400, stageHeight: 300 });
    let called = false;
    connectSignal(enableStageSignals(stage).onResize, () => {
      called = true;
    });
    setStageSize(stage, 400, 300);
    expect(called).toBe(false);
  });

  it('does not emit onResize when no one has subscribed', () => {
    const stage = createStage();
    expect(() => setStageSize(stage, 1280, 720)).not.toThrow();
  });
});
