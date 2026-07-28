import { setRectangle } from '@flighthq/geometry/contract';
import { getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import {
  defaultNode2DHitTestHandler,
  defaultHtmlViewHitTestHandler,
  defaultMovieClipHitTestHandler,
  defaultRenderTargetNode2DHitTestHandler,
  defaultRichTextHitTestHandler,
  defaultShapeHitTestHandler,
  defaultTextHitTestHandler,
  defaultTextInputHitTestHandler,
  defaultVideoHitTestHandler,
} from './displayHitTests';

function makeNode2D() {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
  return obj;
}

describe('defaultHtmlViewHitTestHandler', () => {
  it('always returns false â€” browser manages HtmlView hit testing', () => {
    const obj = makeNode2D();
    expect(defaultHtmlViewHitTestHandler(obj, 50, 50)).toBe(false);
  });
});

describe('defaultMovieClipHitTestHandler', () => {
  it('always returns false â€” containers have no self hit area', () => {
    const obj = makeNode2D();
    expect(defaultMovieClipHitTestHandler(obj, 50, 50)).toBe(false);
  });
});

describe('defaultNode2DHitTestHandler', () => {
  it('always returns false â€” plain display objects have no hit geometry', () => {
    const obj = makeNode2D();
    expect(defaultNode2DHitTestHandler(obj, 50, 50)).toBe(false);
    expect(defaultNode2DHitTestHandler(obj, 0, 0)).toBe(false);
    expect(defaultNode2DHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultRenderTargetNode2DHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeNode2D();
    expect(defaultRenderTargetNode2DHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeNode2D();
    expect(defaultRenderTargetNode2DHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultRichTextHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeNode2D();
    expect(defaultRichTextHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeNode2D();
    expect(defaultRichTextHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultShapeHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeNode2D();
    expect(defaultShapeHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeNode2D();
    expect(defaultShapeHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultTextHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeNode2D();
    expect(defaultTextHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeNode2D();
    expect(defaultTextHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultTextInputHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeNode2D();
    expect(defaultTextInputHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeNode2D();
    expect(defaultTextInputHitTestHandler(obj, 200, 200)).toBe(false);
  });
});

describe('defaultVideoHitTestHandler', () => {
  it('returns true when point is within local bounds', () => {
    const obj = makeNode2D();
    expect(defaultVideoHitTestHandler(obj, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const obj = makeNode2D();
    expect(defaultVideoHitTestHandler(obj, 200, 200)).toBe(false);
  });
});
