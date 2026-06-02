import { createMatrix, createRectangle } from '@flighthq/geometry';
import { addSceneChild } from '@flighthq/scene-core';
import { connectSignal } from '@flighthq/signals';
import type { PartialNode, SceneNode, Stage } from '@flighthq/types';
import { StageKind } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import {
  computeStageAlignX,
  computeStageAlignY,
  computeStageFillScale,
  computeStageFitScale,
  computeStageLocalBoundsRectangle,
  createStage,
  createStageData,
  createStageRuntime,
  createStageSignals,
  getDisplayObjectStage,
  getStageRuntime,
  getStageSignals,
  setStageRenderTransform,
  setStageSize,
} from './stage';

describe('computeStageAlignX', () => {
  it('returns 0 for left-anchored alignments', () => {
    expect(computeStageAlignX(400, 800, 'left')).toBe(0);
    expect(computeStageAlignX(400, 800, 'topleft')).toBe(0);
    expect(computeStageAlignX(400, 800, 'bottomleft')).toBe(0);
  });

  it('returns viewWidth - scaledWidth for right-anchored alignments', () => {
    expect(computeStageAlignX(400, 800, 'right')).toBe(400);
    expect(computeStageAlignX(400, 800, 'topright')).toBe(400);
    expect(computeStageAlignX(400, 800, 'bottomright')).toBe(400);
  });

  it('returns centered offset for top/bottom alignments', () => {
    expect(computeStageAlignX(400, 800, 'top')).toBe(200);
    expect(computeStageAlignX(400, 800, 'bottom')).toBe(200);
  });
});

describe('computeStageAlignY', () => {
  it('returns 0 for top-anchored alignments', () => {
    expect(computeStageAlignY(300, 600, 'top')).toBe(0);
    expect(computeStageAlignY(300, 600, 'topleft')).toBe(0);
    expect(computeStageAlignY(300, 600, 'topright')).toBe(0);
  });

  it('returns viewHeight - scaledHeight for bottom-anchored alignments', () => {
    expect(computeStageAlignY(300, 600, 'bottom')).toBe(300);
    expect(computeStageAlignY(300, 600, 'bottomleft')).toBe(300);
    expect(computeStageAlignY(300, 600, 'bottomright')).toBe(300);
  });

  it('returns centered offset for left/right alignments', () => {
    expect(computeStageAlignY(300, 600, 'left')).toBe(150);
    expect(computeStageAlignY(300, 600, 'right')).toBe(150);
  });
});

describe('computeStageFillScale', () => {
  it('returns max of width and height ratios', () => {
    expect(computeStageFillScale(400, 300, 800, 600)).toBe(2);
  });

  it('uses the larger ratio when width ratio wins', () => {
    expect(computeStageFillScale(400, 300, 800, 400)).toBeCloseTo(2);
  });

  it('uses the larger ratio when height ratio wins', () => {
    expect(computeStageFillScale(400, 300, 400, 600)).toBe(2);
  });
});

describe('computeStageFitScale', () => {
  it('returns min of width and height ratios', () => {
    expect(computeStageFitScale(400, 300, 800, 600)).toBe(2);
  });

  it('uses the smaller ratio when width ratio wins', () => {
    expect(computeStageFitScale(400, 300, 400, 600)).toBe(1);
  });

  it('uses the smaller ratio when height ratio wins', () => {
    expect(computeStageFitScale(400, 300, 800, 400)).toBeCloseTo(400 / 300);
  });
});

describe('computeStageLocalBoundsRectangle', () => {
  it('sets out dimensions from stageWidth and stageHeight', () => {
    const stage = createStage({ data: { stageWidth: 800, stageHeight: 600 } });
    const out = createRectangle();
    computeStageLocalBoundsRectangle(out, stage as unknown as SceneNode);
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
    addSceneChild(root, child);
    expect(getDisplayObjectStage(child)).toBeNull();
  });

  it('returns the Stage when it is the root', () => {
    const stage = createStage();
    const child = createDisplayObject();
    addSceneChild(stage, child);
    expect(getDisplayObjectStage(child)).toBe(stage);
  });

  it('returns the Stage from a deeply nested node', () => {
    const stage = createStage();
    const mid = createDisplayObject();
    const leaf = createDisplayObject();
    addSceneChild(stage, mid);
    addSceneChild(mid, leaf);
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

describe('setStageRenderTransform', () => {
  it('noscale: sets identity scale with topleft offset', () => {
    const m = createMatrix();
    setStageRenderTransform(m, 400, 300, 800, 600, 'noscale', 'topleft');
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('noscale: centers the stage in the viewport for top alignment', () => {
    const m = createMatrix();
    setStageRenderTransform(m, 400, 300, 800, 600, 'noscale', 'top');
    expect(m.a).toBe(1);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(200);
    expect(m.ty).toBe(0);
  });

  it('exactfit: scales to fill viewport exactly', () => {
    const m = createMatrix();
    setStageRenderTransform(m, 400, 300, 800, 600, 'exactfit', 'topleft');
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('exactfit: uses independent x/y scales', () => {
    const m = createMatrix();
    setStageRenderTransform(m, 400, 300, 800, 450, 'exactfit', 'topleft');
    expect(m.a).toBe(2);
    expect(m.d).toBe(1.5);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('showall: fits stage within viewport with uniform scale', () => {
    const m = createMatrix();
    // viewport 800x400, stage 400x300: height ratio 400/300â‰ˆ1.33 < width ratio 2
    setStageRenderTransform(m, 400, 300, 800, 400, 'showall', 'topleft');
    const s = 400 / 300;
    expect(m.a).toBeCloseTo(s);
    expect(m.d).toBeCloseTo(s);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('showall: centers remaining space with top alignment', () => {
    const m = createMatrix();
    // stage 400x300, viewport 800x600: uniform scale=2, scaled stage fills viewport exactly
    setStageRenderTransform(m, 400, 300, 800, 600, 'showall', 'top');
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('showall: letterboxes with centered alignment for left/right alignment', () => {
    const m = createMatrix();
    // viewport 800x400, stage 400x300: scale=400/300, scaledW=400/300*400â‰ˆ533, cx=(800-533)/2â‰ˆ133
    setStageRenderTransform(m, 400, 300, 800, 400, 'showall', 'left');
    expect(m.ty).toBeCloseTo((400 - (400 / 300) * 300) / 2);
  });

  it('noborder: fills viewport with uniform scale', () => {
    const m = createMatrix();
    // viewport 800x400, stage 400x300: max(2, 1.33)=2, scaledH=600 > viewH=400
    setStageRenderTransform(m, 400, 300, 800, 400, 'noborder', 'topleft');
    expect(m.a).toBe(2);
    expect(m.d).toBe(2);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('noborder: centers overflowing content with top alignment', () => {
    const m = createMatrix();
    setStageRenderTransform(m, 400, 300, 800, 400, 'noborder', 'top');
    expect(m.tx).toBeCloseTo((800 - 400 * 2) / 2);
    expect(m.ty).toBe(0);
  });

  it('sets b and c to 0', () => {
    const m = createMatrix();
    setStageRenderTransform(m, 400, 300, 800, 600, 'showall', 'topleft');
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
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
