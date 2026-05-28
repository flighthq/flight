import {
  createRectangle,
  createVector2,
  rectBottom,
  rectBottomRight,
  rectClone,
  rectContains,
  rectContainsPoint,
  rectContainsRect,
  rectCopy,
  rectEquals,
  rectInflate,
  rectInflatePoint,
  rectIntersection,
  rectIntersects,
  rectIsEmpty,
  rectIsFlippedX,
  rectIsFlippedY,
  rectLeft,
  rectMaxX,
  rectMaxY,
  rectMinX,
  rectMinY,
  rectNormalize,
  rectNormalizedBottomRight,
  rectNormalizedTopLeft,
  rectOffset,
  rectOffsetPoint,
  rectRight,
  rectSetBottom,
  rectSetBottomRight,
  rectSetEmpty,
  rectSetLeft,
  rectSetRight,
  rectSetSize,
  rectSetTo,
  rectSetTop,
  rectSetTopLeft,
  rectSize,
  rectTop,
  rectTopLeft,
  rectUnion,
} from '@flighthq/geometry';
import type { Rectangle } from '@flighthq/types';

let r: Rectangle;
let r2: Rectangle;

beforeEach(() => {
  r = createRectangle(0, 0, 10, 20);
  r2 = createRectangle(2, 5, 3, 4);
});

describe('create', () => {
  it('initializes with default values', () => {
    const rect = createRectangle();
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it('initializes with specified values', () => {
    const rect = createRectangle(1, 2, 3, 4);
    expect(rect.x).toBe(1);
    expect(rect.y).toBe(2);
    expect(rect.width).toBe(3);
    expect(rect.height).toBe(4);
  });
});

// Properties
describe('bottom', () => {
  it('returns y + height', () => {
    expect(rectBottom(r)).toBe(20);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    expect(rectBottom(r)).toBe(20);
  });
});

describe('isFlippedX', () => {
  it('returns false if width is positive', () => {
    expect(rectIsFlippedX(r)).toBe(false);
  });

  it('returns false if width is negative', () => {
    r.width = -10;
    expect(rectIsFlippedX(r)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectIsFlippedX(r)).toBe(false);
  });
});

describe('isFlippedY', () => {
  it('returns false if height is positive', () => {
    expect(rectIsFlippedY(r)).toBe(false);
  });

  it('returns false if height is negative', () => {
    r.height = -20;
    expect(rectIsFlippedY(r)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectIsFlippedY(r)).toBe(false);
  });
});

describe('left', () => {
  it('returns x', () => {
    expect(rectLeft(r)).toBe(0);
  });
});

describe('maxX', () => {
  it('returns correct maximum X for positive rectangle', () => {
    expect(rectMaxX(r)).toBe(10);
  });

  it('returns correct maximum X for flipped rectangle', () => {
    r.width = -5;
    expect(rectMaxX(r)).toBe(0);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectMaxX(r)).toBe(10);
  });
});

describe('maxY', () => {
  it('returns correct maximum Y for positive rectangle', () => {
    expect(rectMaxY(r)).toBe(20);
  });

  it('returns correct maximum Y for flipped rectangle', () => {
    r.height = -10;
    expect(rectMaxY(r)).toBe(0);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectMaxY(r)).toBe(10);
  });
});

describe('minX', () => {
  it('returns correct minimum X for positive rectangle', () => {
    expect(rectMinX(r)).toBe(0);
  });

  it('returns correct minimum X for flipped rectangle', () => {
    r.width = -5;
    expect(rectMinX(r)).toBe(-5);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectMinX(r)).toBe(0);
  });
});

describe('minY', () => {
  it('returns correct minimum Y for positive rectangle', () => {
    expect(rectMinY(r)).toBe(0);
  });

  it('returns correct minimum Y for flipped rectangle', () => {
    r.height = -10;
    expect(rectMinY(r)).toBe(-10);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectMinY(r)).toBe(0);
  });
});

describe('right', () => {
  it('getter returns x + width', () => {
    expect(rectRight(r)).toBe(10);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 5, y: 0, width: 5, height: 0 };
    expect(rectRight(r)).toBe(10);
  });
});

describe('top', () => {
  it('returns y', () => {
    expect(rectTop(r)).toBe(0);
  });
});

describe('bottomRight', () => {
  it('returns correct Vector2', () => {
    const br = createVector2();
    rectBottomRight(br, r);
    expect(br.x).toBe(10);
    expect(br.y).toBe(20);
  });
});

describe('clone', () => {
  it('clone creates a copy', () => {
    const c = rectClone(r);
    expect(rectEquals(r, c)).toBe(true);
  });

  it('clone does not affect original rectangle', () => {
    const c = rectClone(r);
    c.x = 100;
    expect(r.x).not.toBe(c.x); // Original should remain unchanged
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 1, y: 1, width: 100, height: 100 };
    const c = rectClone(r);
    c.x = 100;
    expect(r.x).not.toBe(c.x);
  });

  it('returns a Rectangle instance', () => {
    const r = { x: 1, y: 1, width: 100, height: 100 };
    const c: Rectangle = rectClone(r);
    expect(c).not.toBeNull();
  });
});

describe('contains', () => {
  it('returns true for a point inside', () => {
    expect(rectContains(r, 5, 10)).toBe(true);
  });

  it('returns false for a point outside', () => {
    expect(rectContains(r, -1, 0)).toBe(false);
  });

  it('works with flipped rectangle', () => {
    r.width = -10;
    r.height = -20;
    expect(rectContains(r, -5, -10)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: -10, height: -20 };
    expect(rectContains(r, -5, -10)).toBe(true);
  });
});

describe('containsPoint', () => {
  it('delegates to contains', () => {
    expect(rectContainsPoint(r, createVector2(5, 10))).toBe(true);
  });

  it('allows point-like and rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const p = { x: 5, y: 10 };
    expect(rectContainsPoint(r, p)).toBe(true);
  });
});

describe('containsRect', () => {
  it('returns true if rectangle is fully inside', () => {
    // r: 0,0,10,10
    // r2: 2,2,5,5 fully inside r
    r2.x = 2;
    r2.y = 2;
    r2.width = 5;
    r2.height = 5;
    expect(rectContainsRect(r, r2)).toBe(true);
  });

  it('returns false if rectangle partially outside', () => {
    r2.x = -1; // partially outside on the left
    r2.y = 2;
    r2.width = 5;
    r2.height = 5;
    expect(rectContainsRect(r, r2)).toBe(false);
  });

  it('works with flipped rectangle fully inside', () => {
    // Flipped rectangle: width and height negative
    r2.x = 5;
    r2.y = 6;
    r2.width = -3; // left edge at 2
    r2.height = -4; // top edge at 2
    expect(rectContainsRect(r, r2)).toBe(true);
  });

  it('returns false if flipped rectangle exceeds bounds', () => {
    // Flipped rectangle exceeding bounds on left/top
    r2.x = 15;
    r2.y = 15;
    r2.width = -20; // left edge at -5
    r2.height = -20; // top edge at -5
    expect(rectContainsRect(r, r2)).toBe(false);
  });

  it('works if flipped rectangle exactly fits inside', () => {
    // Flipped rectangle with exact bounds
    r2.x = 10;
    r2.y = 10;
    r2.width = -10; // left edge 0
    r2.height = -10; // top edge 0
    expect(rectContainsRect(r, r2)).toBe(true);
  });

  it('returns false if zero-size rectangle outside', () => {
    r2.x = 20;
    r2.y = 20;
    r2.width = 0;
    r2.height = 0;
    expect(rectContainsRect(r, r2)).toBe(false);
  });

  it('returns true if zero-size rectangle exactly on a corner', () => {
    r2.x = 0;
    r2.y = 0;
    r2.width = 0;
    r2.height = 0;
    expect(rectContainsRect(r, r2)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    // r: 0,0,10,10
    // r2: 2,2,5,5 fully inside r
    const r2 = { x: 2, y: 2, width: 5, height: 5 };
    expect(rectContainsRect(r, r2)).toBe(true);
  });
});

describe('copy', () => {
  it('copies values', () => {
    rectCopy(r, r2);
    expect(rectEquals(r, r2)).toBe(true);
  });

  it('does not change the original values if source and target are the same', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    rectCopy(r1, r1); // r1 is both source and target

    // Ensure no changes occur
    expect(r1.x).toBe(0);
    expect(r1.y).toBe(0);
    expect(r1.width).toBe(10);
    expect(r1.height).toBe(10);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const r2 = { x: 2, y: 2, width: 2, height: 2 };
    rectCopy(r2, r);
    expect(rectEquals(r, r2)).toBe(true);
  });
});

describe('equals', () => {
  it('returns true for identical rectangles', () => {
    expect(rectEquals(r, r)).toBe(true);
    expect(rectEquals(r, rectClone(r))).toBe(true);
  });

  it('returns false for different rectangles', () => {
    r2.x = 1;
    expect(rectEquals(r, r2)).toBe(false);
  });

  it('allows rectangle like objects', () => {
    const r = { x: 1, y: 1, width: 1, height: 1 };
    const r2 = { x: 1, y: 1, width: 1, height: 1 };
    expect(rectEquals(r, r)).toBe(true);
    expect(rectEquals(r, r2)).toBe(true);
  });
});

describe('intersection', () => {
  it('returns intersection rectangle', () => {
    const r3 = createRectangle(5, 10, 10, 10);
    const result = createRectangle();
    rectIntersection(result, r, r3);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
    expect(result.width).toBe(5);
    expect(result.height).toBe(10);
  });

  it('returns empty rectangle if no intersection', () => {
    const r3 = createRectangle(20, 20, 5, 5);
    const result = createRectangle();
    rectIntersection(result, r, r3);
    expect(rectIsEmpty(result)).toBe(true);
  });

  it('correctly modifies the original rectangle when intersection is empty', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    const r2 = createRectangle(20, 20, 5, 5);
    const result = r1;
    rectIntersection(r1, r1, r2); // r1 is both source and target

    // Ensure the result is empty (since no intersection)
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);

    // Ensure r1 is also modified correctly (should be set to empty)
    expect(r1.width).toBe(0); // r1's width should be 0
    expect(r1.height).toBe(0); // r1's height should be 0
  });

  it('correctly modifies the target when intersection occurs', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    const r2 = createRectangle(5, 5, 10, 10);
    const result = r1;
    rectIntersection(r1, r1, r2); // r1 is both source and target

    // Ensure r1 is correctly modified
    expect(result.width).toBe(5); // Correct intersection width
    expect(result.height).toBe(5); // Correct intersection height
    expect(r1.width).toBe(5); // Ensure r1 got updated
    expect(r1.height).toBe(5); // Ensure r1 got updated
  });

  it('allows rectangle-like objects', () => {
    const r3 = { x: 5, y: 10, width: 10, height: 10 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectIntersection(result, r, r3);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
    expect(result.width).toBe(5);
    expect(result.height).toBe(10);
  });
});

describe('intersects', () => {
  it('returns true if rectangles overlap', () => {
    const r3 = createRectangle(5, 10, 10, 10);
    expect(rectIntersects(r, r3)).toBe(true);
  });

  it('returns false if rectangles do not overlap', () => {
    const r3 = createRectangle(20, 20, 5, 5);
    expect(rectIntersects(r, r3)).toBe(false);
  });

  it('allows rectangle-like objects', () => {
    const r3 = { x: 5, y: 10, width: 10, height: 10 };
    expect(rectIntersects(r, r3)).toBe(true);
  });
});

describe('isEmpty', () => {
  it('returns true only for zero width or height', () => {
    expect(rectIsEmpty(r)).toBe(false);
    r.width = 0;
    expect(rectIsEmpty(r)).toBe(true);
    r.width = 10;
    r.height = 0;
    expect(rectIsEmpty(r)).toBe(true);
    r.width = -5;
    r.height = -5;
    expect(rectIsEmpty(r)).toBe(false); // flipped rectangles are valid
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectIsEmpty(r)).toBe(false);
    r.width = 0;
    expect(rectIsEmpty(r)).toBe(true);
  });
});

describe('offset', () => {
  it('moves rectangle', () => {
    const result = createRectangle();
    rectOffset(result, r, 5, 10);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('correctly offsets the rectangle when it is both source and target', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    rectOffset(r1, r1, 5, 10); // r1 is both source and target

    // Ensure r1 is correctly offset
    expect(r1.x).toBe(5);
    expect(r1.y).toBe(10);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectOffset(result, r, 5, 10);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });
});

describe('offsetPoint', () => {
  it('moves rectangle by Vector2', () => {
    const out = createRectangle();
    rectOffsetPoint(out, r, createVector2(3, 4));
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });

  it('allows rectangle- and point-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const p = { x: 3, y: 4 };
    const out = { x: 0, y: 0, width: 0, height: 0 };
    rectOffsetPoint(out, r, p);
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });
});

describe('inflate', () => {
  it('inflates rectangle by dx/dy', () => {
    const result = createRectangle();
    rectInflate(result, r, 2, 3);
    expect(result).not.toBe(r);
    expect(result.x).toBe(-2);
    expect(result.y).toBe(-3);
    expect(result.width).toBe(14);
    expect(result.height).toBe(26);
  });

  it('correctly inflates the rectangle when it is both source and target', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    rectInflate(r1, r1, 2, 3); // r1 is both source and target

    // Ensure r1 is correctly inflated
    expect(r1.x).toBe(-2);
    expect(r1.y).toBe(-3);
    expect(r1.width).toBe(14);
    expect(r1.height).toBe(16);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectInflate(result, r, 2, 3);
    expect(result).not.toBe(r);
    expect(result.x).toBe(-2);
    expect(result.y).toBe(-3);
    expect(result.width).toBe(14);
    expect(result.height).toBe(26);
  });
});

describe('inflatePoint', () => {
  it('inflates rectangle by Vector2', () => {
    const result = createRectangle();
    rectInflatePoint(result, r, createVector2(1, 2));
    expect(result).not.toBe(r);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(-2);
    expect(result.width).toBe(12);
    expect(result.height).toBe(24);
  });

  it('allows rectangle- and point-like objects', () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    const p = { x: 1, y: 2 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectInflatePoint(result, r, p);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(-2);
    expect(result.width).toBe(12);
    expect(result.height).toBe(24);
  });
});

describe('normalize', () => {
  it('returns rectangle with positive width and height', () => {
    r.x = 10;
    r.y = 20;
    r.width = -5;
    r.height = -15;
    const n = createRectangle();
    rectNormalize(n, r);
    expect(n.x).toBe(5);
    expect(n.y).toBe(5);
    expect(n.width).toBe(5);
    expect(n.height).toBe(15);
  });

  it('normalized of positive rectangle equals original', () => {
    const n = createRectangle();
    rectNormalize(n, r);
    expect(n.x).toBe(r.x);
    expect(n.y).toBe(r.y);
    expect(n.width).toBe(r.width);
    expect(n.height).toBe(r.height);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    const n = { x: 0, y: 0, width: 0, height: 0 };
    rectNormalize(n, r);
    expect(n.x).toBe(5);
    expect(n.y).toBe(5);
    expect(n.width).toBe(5);
    expect(n.height).toBe(15);
  });
});

describe('normalizedTopLeft', () => {
  it('return proper Vector2s', () => {
    r.x = 10;
    r.y = 20;
    r.width = -5;
    r.height = -15;
    const ntl = createVector2();
    rectNormalizedTopLeft(ntl, r);
    expect(ntl.x).toBe(5);
    expect(ntl.y).toBe(5);
  });

  it('match min/max for positive rectangles', () => {
    r.x = 2;
    r.y = 3;
    r.width = 10;
    r.height = 15;
    const ntl = createVector2();
    rectNormalizedTopLeft(ntl, r);
    expect(ntl.x).toBe(rectMinX(r));
    expect(ntl.y).toBe(rectMinY(r));
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    let ntl = { x: 0, y: 0 };
    rectNormalizedTopLeft(ntl, r);
    expect(ntl.x).toBe(5);
    expect(ntl.y).toBe(5);
  });
});

describe('normalizedBottomRight', () => {
  it('return proper Vector2s', () => {
    r.x = 10;
    r.y = 20;
    r.width = -5;
    r.height = -15;
    const nbr = createVector2();
    rectNormalizedBottomRight(nbr, r);
    expect(nbr.x).toBe(10);
    expect(nbr.y).toBe(20);
  });

  it('match min/max for positive rectangles', () => {
    r.x = 2;
    r.y = 3;
    r.width = 10;
    r.height = 15;
    const nbr = createVector2();
    rectNormalizedBottomRight(nbr, r);
    expect(nbr.x).toBe(rectMaxX(r));
    expect(nbr.y).toBe(rectMaxY(r));
  });

  it('allows Rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    const nbr = { x: 0, y: 0 };
    rectNormalizedBottomRight(nbr, r);
    expect(nbr.x).toBe(10);
    expect(nbr.y).toBe(20);
  });
});

describe('set', () => {
  it('sets rectangle to specified values', () => {
    rectSetTo(r, 1, 2, 3, 4);
    expect(r.x).toBe(1);
    expect(r.y).toBe(2);
    expect(r.width).toBe(3);
    expect(r.height).toBe(4);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    rectSetTo(r, 1, 2, 3, 4);
    expect(r.x).toBe(1);
    expect(r.y).toBe(2);
    expect(r.width).toBe(3);
    expect(r.height).toBe(4);
  });
});

describe('setBottomRight', () => {
  it('adjusts width and height', () => {
    rectSetBottomRight(r, createVector2(15, 25));
    expect(r.width).toBe(15);
    expect(r.height).toBe(25);
  });
});

describe('setEmpty', () => {
  it('sets rectangle to zero', () => {
    rectSetEmpty(r);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    rectSetEmpty(r);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe('setLeft', () => {
  it('adjusts width correctly', () => {
    rectSetLeft(r, 5);
    expect(r.x).toBe(5);
    expect(r.width).toBe(5);
  });
});

describe('setSize', () => {
  it('setter adjusts width and height', () => {
    rectSetSize(r, createVector2(5, 6));
    expect(r.width).toBe(5);
    expect(r.height).toBe(6);
  });
});

describe('setTop', () => {
  it('adjusts height correctly', () => {
    rectSetTop(r, 5);
    expect(r.y).toBe(5);
    expect(r.height).toBe(15);
  });

  it('can create negative height (flipped rectangle)', () => {
    rectSetTop(r, 25);
    expect(r.height).toBe(-5);
  });
});

describe('setTopLeft', () => {
  it('setter updates x and y', () => {
    const out = createRectangle();
    rectSetTopLeft(out, createVector2(3, 4));
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });

  it('allows point-like objects', () => {
    const r = { x: 0, y: 0, height: 0, width: 0 };
    let tl = { x: 10, y: 10 };
    rectSetTopLeft(r, tl);
    expect(r.x).toBe(10);
    expect(r.y).toBe(10);
  });
});

describe('setRight', () => {
  it('adjusts width', () => {
    rectSetRight(r, 15);
    expect(r.width).toBe(15);
  });

  it('accounts for x', () => {
    r.x = 10;
    rectSetRight(r, 15);
    expect(r.width).toBe(5);
  });

  it('can create negative width (flipped rectangle)', () => {
    rectSetRight(r, -5);
    expect(r.width).toBe(-5);
  });
});

describe('size', () => {
  it('returns width and height as Vector2', () => {
    const s = createVector2();
    rectSize(s, r);
    expect(s.x).toBe(10);
    expect(s.y).toBe(20);
  });
});

describe('topLeft', () => {
  it('getter returns top-left Vector2', () => {
    const tl = createVector2();
    rectTopLeft(tl, r);
    expect(tl.x).toBe(0);
    expect(tl.y).toBe(0);
  });

  it('allows point-like objects', () => {
    const r = { x: 0, y: 0, height: 0, width: 0 };
    let tl = { x: 0, y: 0 };
    rectTopLeft(tl, r);
    expect(tl.x).toBe(0);
    expect(tl.y).toBe(0);
  });
});

describe('union', () => {
  it('returns union of two rectangles', () => {
    const r3 = createRectangle(5, 15, 10, 10);
    const u = createRectangle();
    rectUnion(u, r, r3);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.width).toBe(15);
    expect(u.height).toBe(25);
  });

  it('union works with zero-width rectangle', () => {
    const r3 = createRectangle(5, 15, 0, 0);
    const u = createRectangle();
    rectUnion(u, r, r3);
    expect(rectEquals(u, r)).toBe(true);
  });

  it('has the values of the right-hand rectangle if the left-hand is degenerate', () => {
    const lh = createRectangle();
    const rh = createRectangle(5, 15, 100, 100);
    const out = createRectangle();
    rectUnion(out, lh, rh);
    expect(rectEquals(out, rh)).toBe(true);
  });

  it('has the values of the left-hand rectangle if the right-hand is degenerate', () => {
    const lh = createRectangle(5, 15, 100, 100);
    const rh = createRectangle();
    const out = createRectangle();
    rectUnion(out, lh, rh);
    expect(rectEquals(out, lh)).toBe(true);
  });

  it('returns an empty rectangle if both are degenerate', () => {
    const lh = createRectangle(-50, -150, 0, 0);
    const rh = createRectangle(-5, -15, 0, 0);
    const out = createRectangle();
    rectUnion(out, lh, rh);
    expect(rectIsEmpty(out)).toBe(true);
  });

  it('returns the x/y of the left-hand rectangle if both are degenerate', () => {
    const lh = createRectangle(-50, -150, 0, 0);
    const rh = createRectangle(-5, -15, 0, 0);
    const out = createRectangle();
    rectUnion(out, lh, rh);
    expect(rectEquals(out, lh)).toBe(true);
  });

  it('does nothing if right-hand is empty and source===out', () => {
    const lh = createRectangle(-50, -150, 0, 0);
    const rh = createRectangle(-5, -15, 0, 0);
    const cache = createRectangle();
    rectCopy(cache, lh);
    rectUnion(lh, lh, rh);
    expect(rectEquals(cache, lh)).toBe(true);
  });

  it('union works with flipped rectangles', () => {
    const r3 = createRectangle(15, 20, -10, -10);
    const u = createRectangle();
    rectUnion(u, r, r3);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.width).toBe(15);
    expect(u.height).toBe(20);
  });

  it('correctly modifies the target when union occurs', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    const r2 = createRectangle(5, 5, 10, 10);
    const result = r1;
    rectUnion(r1, r1, r2); // r1 is both source and target

    // Ensure r1 is correctly updated
    expect(result.width).toBe(15); // Correct union width
    expect(result.height).toBe(15); // Correct union height
    expect(r1.width).toBe(15); // r1 should be updated
    expect(r1.height).toBe(15); // r1 should be updated
  });

  it('correctly handles union of non-overlapping rectangles', () => {
    const r1 = createRectangle(0, 0, 10, 10);
    const r2 = createRectangle(20, 20, 5, 5);
    const result = r1;
    rectUnion(r1, r1, r2); // r1 is both source and target

    // Ensure r1 is correctly updated
    expect(result.width).toBe(25); // Correct union width
    expect(result.height).toBe(25); // Correct union height
    expect(r1.width).toBe(25); // r1 should be updated
    expect(r1.height).toBe(25); // r1 should be updated
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    const r3 = { x: 5, y: 15, width: 10, height: 10 };
    const u = { x: 0, y: 0, width: 0, height: 0 };
    rectUnion(u, r, r3);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.width).toBe(15);
    expect(u.height).toBe(25);
  });
});

describe('setBottom', () => {
  it('adjusts height so that y + height equals value', () => {
    const rect = createRectangle(0, 10, 5, 5);
    rectSetBottom(rect, 30);
    expect(rect.height).toBe(20);
  });

  it('can set bottom to equal y (zero height)', () => {
    const rect = createRectangle(0, 5, 10, 10);
    rectSetBottom(rect, 5);
    expect(rect.height).toBe(0);
  });
});

describe('setTo', () => {
  it('assigns all four properties', () => {
    const rect = createRectangle();
    rectSetTo(rect, 1, 2, 3, 4);
    expect(rect.x).toBe(1);
    expect(rect.y).toBe(2);
    expect(rect.width).toBe(3);
    expect(rect.height).toBe(4);
  });

  it('overwrites existing values', () => {
    const rect = createRectangle(10, 20, 30, 40);
    rectSetTo(rect, 0, 0, 0, 0);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });
});
