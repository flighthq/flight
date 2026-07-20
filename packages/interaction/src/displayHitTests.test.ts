import { createDisplayObject } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';

import {
  defaultBitmapHitTestHandler,
  defaultDisplayObjectHitTestHandler,
  defaultHtmlViewHitTestHandler,
  defaultMovieClipHitTestHandler,
  defaultRenderViewHitTestHandler,
  defaultRichTextHitTestHandler,
  defaultShapeHitTestHandler,
  defaultTextHitTestHandler,
  defaultTextInputHitTestHandler,
  defaultVideoHitTestHandler,
} from './displayHitTests';

function makeDisplayObject() {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
  return obj;
}

describe('defaultBitmapHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultBitmapHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultDisplayObjectHitTestHandler', () => {
  it('always returns false â€” plain display objects have no hit geometry', () => {
    const obj = makeDisplayObject();
    expect(defaultDisplayObjectHitTestHandler(obj, 50, 50)).toBe(false);
    expect(defaultDisplayObjectHitTestHandler(obj, 0, 0)).toBe(false);
    expect(defaultDisplayObjectHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultHtmlViewHitTestHandler', () => {
  it('always returns false â€” browser manages HtmlView hit testing', () => {
    const obj = makeDisplayObject();
    expect(defaultHtmlViewHitTestHandler(obj, 50, 50)).toBe(false);
  });
});

describe('defaultMovieClipHitTestHandler', () => {
  it('always returns false â€” containers have no self hit area', () => {
    const obj = makeDisplayObject();
    expect(defaultMovieClipHitTestHandler(obj, 50, 50)).toBe(false);
  });
});

describe('defaultRenderViewHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRenderViewHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRenderViewHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultRichTextHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultRichTextHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultShapeHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultShapeHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultTextHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultTextInputHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextInputHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultTextInputHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultVideoHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeDisplayObject();
    expect(defaultVideoHitTestHandler(obj, 200, 200)).toBe(false);
  });
});
