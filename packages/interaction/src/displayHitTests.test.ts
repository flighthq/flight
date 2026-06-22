import { createDisplayObject } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';

import {
  defaultBitmapHitTestPoint,
  defaultDisplayObjectHitTestPoint,
  defaultHtmlViewHitTestPoint,
  defaultMovieClipHitTestPoint,
  defaultRenderViewHitTestPoint,
  defaultRichTextHitTestPoint,
  defaultShapeHitTestPoint,
  defaultStageHitTestPoint,
  defaultTextHitTestPoint,
  defaultTextInputHitTestPoint,
  defaultVideoHitTestPoint,
} from './displayHitTests';

function makeDisplayObject() {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
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
  it('always returns false â€” plain display objects have no hit geometry', () => {
    const obj = makeDisplayObject();
    expect(defaultDisplayObjectHitTestPoint(obj, 50, 50, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPoint(obj, 0, 0, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPoint(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultHtmlViewHitTestPoint', () => {
  it('always returns false â€” browser manages HtmlView hit testing', () => {
    const obj = makeDisplayObject();
    expect(defaultHtmlViewHitTestPoint(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultMovieClipHitTestPoint', () => {
  it('always returns false â€” containers have no self hit area', () => {
    const obj = makeDisplayObject();
    expect(defaultMovieClipHitTestPoint(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultRenderViewHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRenderViewHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRenderViewHitTestPoint(obj, 200, 200, false)).toBe(false);
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

describe('defaultStageHitTestPoint', () => {
  it('always returns false â€” containers have no self hit area', () => {
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

describe('defaultTextInputHitTestPoint', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextInputHitTestPoint(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextInputHitTestPoint(obj, 200, 200, false)).toBe(false);
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
