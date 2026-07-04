import { createRectangle } from '@flighthq/geometry';
import { addNodeChild } from '@flighthq/node';
import { connectSignal } from '@flighthq/signals';
import type { Node, PartialNode, Stage } from '@flighthq/types';
import { StageKind } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import {
  computeStageLocalBoundsRectangle,
  createStage,
  createStageData,
  createStageRuntime,
  createStageSignals,
  enableStageSignals,
  getDisplayObjectStage,
  getStageRuntime,
  getStageSignals,
  setStageSize,
} from './stage';

describe('computeStageLocalBoundsRectangle', () => {
  it('sets out dimensions from stageWidth and stageHeight', () => {
    const stage = createStage({ data: { stageWidth: 800, stageHeight: 600 } });
    const out = createRectangle();
    computeStageLocalBoundsRectangle(out, stage as unknown as Node);
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });
});

describe('createStage', () => {
  let stage: Stage;

  beforeEach(() => {
    stage = createStage();
  });

  it('initializes default values', () => {
    expect(stage.data.color).toBe(null);
    expect(stage.data.stageHeight).toBe(550);
    expect(stage.data.stageWidth).toBe(400);
    expect(stage.kind).toStrictEqual(StageKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<Stage> = {
      data: {
        color: 0xff0000ff,
        stageHeight: 1000,
        stageWidth: 2000,
      },
    };
    const obj = createStage(base);
    const data = base.data!;
    expect(obj.data.color).toStrictEqual(data.color);
    expect(obj.data.stageHeight).toStrictEqual(data.stageHeight);
    expect(obj.data.stageWidth).toStrictEqual(data.stageWidth);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createStage(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createStageData', () => {
  it('returns default values', () => {
    const data = createStageData();
    expect(data.stageWidth).toBe(400);
    expect(data.stageHeight).toBe(550);
    expect(data.color).toBe(null);
  });

  it('allows pre-defined values', () => {
    const data = createStageData({ stageWidth: 1920, stageHeight: 1080 });
    expect(data.stageWidth).toBe(1920);
    expect(data.stageHeight).toBe(1080);
  });
});

describe('createStageRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createStageRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeStageLocalBoundsRectangle', () => {
    const runtime = createStageRuntime();
    expect(runtime.computeLocalBoundsRectangle).toStrictEqual(computeStageLocalBoundsRectangle);
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

  it('returns null when the root is not a Stage', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    expect(getDisplayObjectStage(child)).toBeNull();
  });

  it('returns the Stage when it is the root', () => {
    const stage = createStage();
    const child = createDisplayObject();
    addNodeChild(stage, child);
    expect(getDisplayObjectStage(child)).toBe(stage);
  });

  it('returns the Stage from a deeply nested node', () => {
    const stage = createStage();
    const mid = createDisplayObject();
    const leaf = createDisplayObject();
    addNodeChild(stage, mid);
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

  it('initializes stageSignals to null', () => {
    const runtime = createStageRuntime();
    expect(runtime.stageSignals).toBeNull();
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
    expect(stage.data.stageWidth).toBe(1920);
    expect(stage.data.stageHeight).toBe(1080);
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
    const stage = createStage({ data: { stageWidth: 400, stageHeight: 300 } });
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
