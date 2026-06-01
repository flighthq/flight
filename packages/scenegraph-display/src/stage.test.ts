import { createRectangle } from '@flighthq/geometry';
import { addGraphChild } from '@flighthq/scenegraph-core';
import { connectSignal } from '@flighthq/signals';
import type { GraphNode, PartialNode, Stage } from '@flighthq/types';
import { StageKind } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import {
  computeStageLocalBoundsRectangle,
  createStage,
  createStageData,
  createStageRuntime,
  createStageSignals,
  getDisplayObjectStage,
  getStageRuntime,
  getStageSignals,
  setStageSize,
} from './stage';

describe('computeStageLocalBoundsRectangle', () => {
  it('sets out dimensions from stageWidth and stageHeight', () => {
    const stage = createStage({ data: { stageWidth: 800, stageHeight: 600 } });
    const out = createRectangle();
    computeStageLocalBoundsRectangle(out, stage as unknown as GraphNode);
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
    expect(stage.data.autoOrients).toBe(true);
    expect(stage.data.align).toBe('topleft');
    expect(stage.data.color).toBe(null);
    expect(stage.data.displayState).toBe('normal');
    expect(stage.data.frameRate).toBe(0);
    expect(stage.data.quality).toBe('high');
    expect(stage.data.scaleMode).toBe('noscale');
    expect(stage.data.stageFocusRect).toBe(false);
    expect(stage.data.stageHeight).toBe(550);
    expect(stage.data.stageWidth).toBe(400);
    expect(stage.kind).toStrictEqual(StageKind);
  });

  it('allows pre-defined values', () => {
    const base: PartialNode<Stage> = {
      data: {
        autoOrients: false,
        align: 'right',
        color: 0xff0000ff,
        displayState: 'fullscreen',
        frameRate: 60,
        quality: 'low',
        scaleMode: 'showall',
        stageFocusRect: true,
        stageHeight: 1000,
        stageWidth: 2000,
      },
    };
    const obj = createStage(base);
    base.data = base.data!; // fix undefined warnings
    expect(obj.data.autoOrients).toStrictEqual(base.data.autoOrients);
    expect(obj.data.align).toStrictEqual(base.data.align);
    expect(obj.data.color).toStrictEqual(base.data.color);
    expect(obj.data.displayState).toStrictEqual(base.data.displayState);
    expect(obj.data.frameRate).toStrictEqual(base.data.frameRate);
    expect(obj.data.quality).toStrictEqual(base.data.quality);
    expect(obj.data.scaleMode).toStrictEqual(base.data.scaleMode);
    expect(obj.data.stageFocusRect).toStrictEqual(base.data.stageFocusRect);
    expect(obj.data.stageHeight).toStrictEqual(base.data.stageHeight);
    expect(obj.data.stageWidth).toStrictEqual(base.data.stageWidth);
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
    expect(data.frameRate).toBe(0);
    expect(data.quality).toBe('high');
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
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeStageLocalBoundsRectangle);
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

describe('getDisplayObjectStage', () => {
  it('returns null when the node has no parent', () => {
    const obj = createDisplayObject();
    expect(getDisplayObjectStage(obj)).toBeNull();
  });

  it('returns null when the root is not a Stage', () => {
    const root = createDisplayObject();
    const child = createDisplayObject();
    addGraphChild(root, child);
    expect(getDisplayObjectStage(child)).toBeNull();
  });

  it('returns the Stage when it is the root', () => {
    const stage = createStage();
    const child = createDisplayObject();
    addGraphChild(stage, child);
    expect(getDisplayObjectStage(child)).toBe(stage);
  });

  it('returns the Stage from a deeply nested node', () => {
    const stage = createStage();
    const mid = createDisplayObject();
    const leaf = createDisplayObject();
    addGraphChild(stage, mid);
    addGraphChild(mid, leaf);
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
  it('lazily creates and returns signals', () => {
    const stage = createStage();
    const signals = getStageSignals(stage);
    expect(signals).toBeDefined();
    expect(signals.onResize).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const stage = createStage();
    expect(getStageSignals(stage)).toBe(getStageSignals(stage));
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
    connectSignal(getStageSignals(stage).onResize, () => {
      called = true;
    });
    setStageSize(stage, 1280, 720);
    expect(called).toBe(true);
  });

  it('does not emit onResize when dimensions are unchanged', () => {
    const stage = createStage({ data: { stageWidth: 400, stageHeight: 300 } });
    let called = false;
    connectSignal(getStageSignals(stage).onResize, () => {
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
