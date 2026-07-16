import { createDisplayObject } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { appendShapeBeginFill, appendShapeCircle, appendShapeEndFill, createShape } from '@flighthq/shape';

import {
  defaultBitmapHitTestPointHandler,
  defaultDisplayObjectHitTestPointHandler,
  defaultHtmlViewHitTestPointHandler,
  defaultMovieClipHitTestPointHandler,
  defaultRenderViewHitTestPointHandler,
  defaultRichTextHitTestPointHandler,
  defaultShapeHitTestPointHandler,
  defaultStageHitTestPointHandler,
  defaultTextHitTestPointHandler,
  defaultTextInputHitTestPointHandler,
  defaultVideoHitTestPointHandler,
} from './displayHitTests';

function makeDisplayObject() {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
  return obj;
}

describe('defaultBitmapHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultDisplayObjectHitTestPointHandler', () => {
  it('always returns false â€” plain display objects have no hit geometry', () => {
    const obj = makeDisplayObject();
    expect(defaultDisplayObjectHitTestPointHandler(obj, 50, 50, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPointHandler(obj, 0, 0, false)).toBe(false);
    expect(defaultDisplayObjectHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultHtmlViewHitTestPointHandler', () => {
  it('always returns false â€” browser manages HtmlView hit testing', () => {
    const obj = makeDisplayObject();
    expect(defaultHtmlViewHitTestPointHandler(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultMovieClipHitTestPointHandler', () => {
  it('always returns false â€” containers have no self hit area', () => {
    const obj = makeDisplayObject();
    expect(defaultMovieClipHitTestPointHandler(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultRenderViewHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRenderViewHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRenderViewHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultRichTextHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultShapeHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });

  it('shapeFlag: winding-tests the actual fill, so a bbox corner outside the circle misses', () => {
    const shape = createShape();
    appendShapeBeginFill(shape, 0xff0000ff, 1);
    appendShapeCircle(shape, 50, 50, 40);
    appendShapeEndFill(shape);
    // Center is inside the fill; (85,85) is inside the bounding box but outside the circle.
    expect(defaultShapeHitTestPointHandler(shape, 50, 50, true)).toBe(true);
    expect(defaultShapeHitTestPointHandler(shape, 85, 85, true)).toBe(false);
    // Without shapeFlag, the coarse bounds box counts (85,85) as a hit.
    setRectangle(getNodeLocalBoundsRectangle(shape), 10, 10, 80, 80);
    expect(defaultShapeHitTestPointHandler(shape, 85, 85, false)).toBe(true);
  });
});

describe('defaultStageHitTestPointHandler', () => {
  it('always returns false â€” containers have no self hit area', () => {
    const obj = makeDisplayObject();
    expect(defaultStageHitTestPointHandler(obj, 50, 50, false)).toBe(false);
  });
});

describe('defaultTextHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultTextInputHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextInputHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextInputHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});

describe('defaultVideoHitTestPointHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestPointHandler(obj, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestPointHandler(obj, 200, 200, false)).toBe(false);
  });
});
