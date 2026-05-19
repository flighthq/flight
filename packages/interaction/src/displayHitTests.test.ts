import { rectangle } from '@flighthq/geometry';
import { addChild, getLocalBoundsRect } from '@flighthq/scene-graph-core';
import { createDisplayObject, createSpriteBatch } from '@flighthq/scene-graph-display';
import type { DisplayObject } from '@flighthq/types';

import {
  defaultBitmapHitTestPoint,
  defaultDisplayObjectHitTestPoint,
  defaultDOMElementHitTestPoint,
  defaultInputTextHitTestPoint,
  defaultMovieClipHitTestPoint,
  defaultRichTextHitTestPoint,
  defaultShapeHitTestPoint,
  defaultSpriteBatchHitTestPoint,
  defaultStageHitTestPoint,
  defaultTextHitTestPoint,
  defaultVideoHitTestPoint,
} from './displayHitTests';

function makeDisplayObject(opaqueBackground: number | null = 0xff0000): DisplayObject {
  const obj = createDisplayObject();
  obj.opaqueBackground = opaqueBackground;
  rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 100, 100);
  return obj;
}

describe('defaultBitmapHitTestPoint', () => {
  it('returns true within bounds with opaqueBackground set', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultBitmapHitTestPoint(obj, 10, 10, false)).toBe(true);
  });

  it('returns false when opaqueBackground is null', () => {
    const obj = makeDisplayObject(null);
    expect(defaultBitmapHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultDisplayObjectHitTestPoint', () => {
  it('returns true when opaqueBackground is set and point is within bounds', () => {
    const obj = makeDisplayObject(0xff0000);
    expect(defaultDisplayObjectHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when opaqueBackground is null', () => {
    const obj = makeDisplayObject(null);
    expect(defaultDisplayObjectHitTestPoint(obj, 50, 50, false)).toBe(false);
  });

  it('returns false when point is outside bounds', () => {
    const obj = makeDisplayObject(0xff0000);
    expect(defaultDisplayObjectHitTestPoint(obj, 200, 200, false)).toBe(false);
  });

  it('ignores shapeFlag (delegates to bounds check only)', () => {
    const obj = makeDisplayObject(0xff0000);
    expect(defaultDisplayObjectHitTestPoint(obj, 50, 50, true)).toBe(true);
    expect(defaultDisplayObjectHitTestPoint(obj, 200, 200, true)).toBe(false);
  });
});

describe('defaultDOMElementHitTestPoint', () => {
  it('returns true within bounds with opaqueBackground set', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultDOMElementHitTestPoint(obj, 10, 10, false)).toBe(true);
  });

  it('returns false when opaqueBackground is null', () => {
    const obj = makeDisplayObject(null);
    expect(defaultDOMElementHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultInputTextHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultInputTextHitTestPoint(obj, 10, 10, false)).toBe(true);
  });
});

describe('defaultMovieClipHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultMovieClipHitTestPoint(obj, 10, 10, false)).toBe(true);
  });

  it('returns false when out of bounds', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultMovieClipHitTestPoint(obj, 999, 999, false)).toBe(false);
  });
});

describe('defaultRichTextHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultRichTextHitTestPoint(obj, 10, 10, false)).toBe(true);
  });
});

describe('defaultShapeHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultShapeHitTestPoint(obj, 10, 10, false)).toBe(true);
  });
});

describe('defaultSpriteBatchHitTestPoint', () => {
  it('returns true when graph is null and opaqueBackground is set within bounds', () => {
    const batch = createSpriteBatch();
    batch.opaqueBackground = 0xff0000;
    batch.data.graph = null;
    rectangle.setTo(getLocalBoundsRect(batch), 0, 0, 100, 100);
    addChild(createDisplayObject(), batch);
    expect(defaultSpriteBatchHitTestPoint(batch, 50, 50, false)).toBe(true);
  });

  it('returns false when graph is null and opaqueBackground is null', () => {
    const batch = createSpriteBatch();
    batch.opaqueBackground = null;
    batch.data.graph = null;
    expect(defaultSpriteBatchHitTestPoint(batch, 50, 50, false)).toBe(false);
  });
});

describe('defaultStageHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultStageHitTestPoint(obj, 10, 10, false)).toBe(true);
  });
});

describe('defaultTextHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultTextHitTestPoint(obj, 10, 10, false)).toBe(true);
  });
});

describe('defaultVideoHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint', () => {
    const obj = makeDisplayObject(0xffffff);
    expect(defaultVideoHitTestPoint(obj, 10, 10, false)).toBe(true);
  });
});
