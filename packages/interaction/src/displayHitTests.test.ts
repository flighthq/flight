import { createDisplayObject } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';

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
