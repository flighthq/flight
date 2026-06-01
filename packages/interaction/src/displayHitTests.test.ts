import { setRectangle } from '@flighthq/geometry';
import { getLocalBoundsRectangle } from '@flighthq/scenegraph-core';
import { createDisplayObject, createSpriteBatch } from '@flighthq/scenegraph-display';

import {
  defaultBitmapHitTestPoint,
  defaultDisplayObjectHitTestPoint,
  defaultHTMLViewHitTestPoint,
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
  setRectangle(getLocalBoundsRectangle(obj), 0, 0, 100, 100);
  return obj;
}

describe('defaultBitmapHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultDisplayObjectHitTestPoint', () => {
  it('always returns false — plain display objects have no hit geometry', () => {
    const obj = makeDisplayObject();
    expect(defaultDisplayObjectHitTestPoint(obj, 50, 50, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPoint(obj, 0, 0, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultHTMLViewHitTestPoint', () => {
  it('always returns false — browser manages HTMLView hit testing', () => {
    const obj = makeDisplayObject();
    expect(defaultHTMLViewHitTestPoint(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultInputTextHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultInputTextHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultInputTextHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultMovieClipHitTestPoint', () => {
  it('always returns false — containers have no self hit area', () => {
    const obj = makeDisplayObject();
    expect(defaultMovieClipHitTestPoint(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultRichTextHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultShapeHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestPoint(obj, 200, 200, false)).toBe(false);
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
  it('always returns false — containers have no self hit area', () => {
    const obj = makeDisplayObject();
    expect(defaultStageHitTestPoint(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultTextHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultVideoHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});
