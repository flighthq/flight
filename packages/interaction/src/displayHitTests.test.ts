import { setRectangle } from '@flighthq/geometry';
import { getLocalBoundsRect } from '@flighthq/scenegraph-core';
import { createDisplayObject, createSpriteBatch } from '@flighthq/scenegraph-display';

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

function makeDisplayObject() {
  const obj = createDisplayObject();
  setRectangle(getLocalBoundsRect(obj), 0, 0, 100, 100);
  return obj;
}

describe('defaultDisplayObjectHitTestPoint', () => {
  it('always returns false — plain display objects have no hit geometry', () => {
    const obj = makeDisplayObject();
    expect(defaultDisplayObjectHitTestPoint(obj, 50, 50, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPoint(obj, 0, 0, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultBitmapHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultDOMElementHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultDOMElementHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultInputTextHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultInputTextHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultMovieClipHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultMovieClipHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultRichTextHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultShapeHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultSpriteBatchHitTestPoint', () => {
  it('returns false when graph is null', () => {
    const batch = createSpriteBatch();
    batch.data.graph = null;
    expect(defaultSpriteBatchHitTestPoint(batch, 50, 50, false)).toBe(false);
  });
});

describe('defaultStageHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultStageHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultTextHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});

describe('defaultVideoHitTestPoint', () => {
  it('delegates to defaultDisplayObjectHitTestPoint (returns false)', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestPoint(obj, 10, 10, false)).toBe(false);
  });
});
