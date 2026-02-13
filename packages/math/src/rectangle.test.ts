import type { Rectangle } from '@flighthq/types';

import * as rectangle from './rectangle.js';
import * as vector2 from './vector2.js';

let r: Rectangle;
let r2: Rectangle;

beforeEach(() => {
  r = rectangle.create(0, 0, 10, 20);
  r2 = rectangle.create(2, 5, 3, 4);
});

describe('create', () => {
  it('initializes with default values', () => {
    const rect = rectangle.create();
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it('initializes with specified values', () => {
    const rect = rectangle.create(1, 2, 3, 4);
    expect(rect.x).toBe(1);
    expect(rect.y).toBe(2);
    expect(rect.width).toBe(3);
    expect(rect.height).toBe(4);
  });
});

// Properties
describe('bottom', () => {
  it('returns y + height', () => {
    expect(rectangle.bottom(r)).toBe(20);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    expect(rectangle.bottom(r)).toBe(20);
  });
});

describe('isFlippedX', () => {
  it('returns false if width is positive', () => {
    expect(rectangle.isFlippedX(r)).toBe(false);
  });

  it('returns false if width is negative', () => {
    r.width = -10;
    expect(rectangle.isFlippedX(r)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectangle.isFlippedX(r)).toBe(false);
  });
});

describe('isFlippedY', () => {
  it('returns false if height is positive', () => {
    expect(rectangle.isFlippedY(r)).toBe(false);
  });

  it('returns false if height is negative', () => {
    r.height = -20;
    expect(rectangle.isFlippedY(r)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectangle.isFlippedY(r)).toBe(false);
  });
});

describe('left', () => {
  it('returns x', () => {
    expect(rectangle.left(r)).toBe(0);
  });
});

describe('maxX', () => {
  it('returns correct maximum X for positive rectangle', () => {
    expect(rectangle.maxX(r)).toBe(10);
  });

  it('returns correct maximum X for flipped rectangle', () => {
    r.width = -5;
    expect(rectangle.maxX(r)).toBe(0);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectangle.maxX(r)).toBe(10);
  });
});

describe('maxY', () => {
  it('returns correct maximum Y for positive rectangle', () => {
    expect(rectangle.maxY(r)).toBe(20);
  });

  it('returns correct maximum Y for flipped rectangle', () => {
    r.height = -10;
    expect(rectangle.maxY(r)).toBe(0);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectangle.maxY(r)).toBe(10);
  });
});

describe('minX', () => {
  it('returns correct minimum X for positive rectangle', () => {
    expect(rectangle.minX(r)).toBe(0);
  });

  it('returns correct minimum X for flipped rectangle', () => {
    r.width = -5;
    expect(rectangle.minX(r)).toBe(-5);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectangle.minX(r)).toBe(0);
  });
});

describe('minY', () => {
  it('returns correct minimum Y for positive rectangle', () => {
    expect(rectangle.minY(r)).toBe(0);
  });

  it('returns correct minimum Y for flipped rectangle', () => {
    r.height = -10;
    expect(rectangle.minY(r)).toBe(-10);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectangle.minY(r)).toBe(0);
  });
});

describe('right', () => {
  it('getter returns x + width', () => {
    expect(rectangle.right(r)).toBe(10);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 5, y: 0, width: 5, height: 0 };
    expect(rectangle.right(r)).toBe(10);
  });
});

describe('top', () => {
  it('returns y', () => {
    expect(rectangle.top(r)).toBe(0);
  });
});

describe('bottomRight', () => {
  it('returns correct Vector2', () => {
    const br = vector2.create();
    rectangle.bottomRight(br, r);
    expect(br.x).toBe(10);
    expect(br.y).toBe(20);
  });
});

describe('clone', () => {
  it('clone creates a copy', () => {
    const c = rectangle.clone(r);
    expect(rectangle.equals(r, c)).toBe(true);
  });

  it('clone does not affect original rectangle', () => {
    const c = rectangle.clone(r);
    c.x = 100;
    expect(r.x).not.toBe(c.x); // Original should remain unchanged
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 1, y: 1, width: 100, height: 100 };
    const c = rectangle.clone(r);
    c.x = 100;
    expect(r.x).not.toBe(c.x);
  });

  it('returns a Rectangle instance', () => {
    const r = { x: 1, y: 1, width: 100, height: 100 };
    const c: Rectangle = rectangle.clone(r);
    expect(c).not.toBeNull();
  });
});

describe('contains', () => {
  it('returns true for a point inside', () => {
    expect(rectangle.contains(r, 5, 10)).toBe(true);
  });

  it('returns false for a point outside', () => {
    expect(rectangle.contains(r, -1, 0)).toBe(false);
  });

  it('works with flipped rectangle', () => {
    r.width = -10;
    r.height = -20;
    expect(rectangle.contains(r, -5, -10)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    const r = { x: 0, y: 0, width: -10, height: -20 };
    expect(rectangle.contains(r, -5, -10)).toBe(true);
  });
});

describe('containsPoint', () => {
  it('delegates to contains', () => {
    expect(rectangle.containsPoint(r, vector2.create(5, 10))).toBe(true);
  });

  it('allows point-like and rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const p = { x: 5, y: 10 };
    expect(rectangle.containsPoint(r, p)).toBe(true);
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
    expect(rectangle.containsRect(r, r2)).toBe(true);
  });

  it('returns false if rectangle partially outside', () => {
    r2.x = -1; // partially outside on the left
    r2.y = 2;
    r2.width = 5;
    r2.height = 5;
    expect(rectangle.containsRect(r, r2)).toBe(false);
  });

  it('works with flipped rectangle fully inside', () => {
    // Flipped rectangle: width and height negative
    r2.x = 5;
    r2.y = 6;
    r2.width = -3; // left edge at 2
    r2.height = -4; // top edge at 2
    expect(rectangle.containsRect(r, r2)).toBe(true);
  });

  it('returns false if flipped rectangle exceeds bounds', () => {
    // Flipped rectangle exceeding bounds on left/top
    r2.x = 15;
    r2.y = 15;
    r2.width = -20; // left edge at -5
    r2.height = -20; // top edge at -5
    expect(rectangle.containsRect(r, r2)).toBe(false);
  });

  it('works if flipped rectangle exactly fits inside', () => {
    // Flipped rectangle with exact bounds
    r2.x = 10;
    r2.y = 10;
    r2.width = -10; // left edge 0
    r2.height = -10; // top edge 0
    expect(rectangle.containsRect(r, r2)).toBe(true);
  });

  it('returns false if zero-size rectangle outside', () => {
    r2.x = 20;
    r2.y = 20;
    r2.width = 0;
    r2.height = 0;
    expect(rectangle.containsRect(r, r2)).toBe(false);
  });

  it('returns true if zero-size rectangle exactly on a corner', () => {
    r2.x = 0;
    r2.y = 0;
    r2.width = 0;
    r2.height = 0;
    expect(rectangle.containsRect(r, r2)).toBe(true);
  });

  it('allows a rectangle-like object', () => {
    // r: 0,0,10,10
    // r2: 2,2,5,5 fully inside r
    const r2 = { x: 2, y: 2, width: 5, height: 5 };
    expect(rectangle.containsRect(r, r2)).toBe(true);
  });
});

describe('copy', () => {
  it('copies values', () => {
    rectangle.copy(r, r2);
    expect(rectangle.equals(r, r2)).toBe(true);
  });

  it('does not change the original values if source and target are the same', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    rectangle.copy(r1, r1); // r1 is both source and target

    // Ensure no changes occur
    expect(r1.x).toBe(0);
    expect(r1.y).toBe(0);
    expect(r1.width).toBe(10);
    expect(r1.height).toBe(10);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const r2 = { x: 2, y: 2, width: 2, height: 2 };
    rectangle.copy(r2, r);
    expect(rectangle.equals(r, r2)).toBe(true);
  });
});

describe('equals', () => {
  it('returns true for identical rectangles', () => {
    expect(rectangle.equals(r, r)).toBe(true);
    expect(rectangle.equals(r, rectangle.clone(r))).toBe(true);
  });

  it('returns false for different rectangles', () => {
    r2.x = 1;
    expect(rectangle.equals(r, r2)).toBe(false);
  });

  it('allows rectangle like objects', () => {
    const r = { x: 1, y: 1, width: 1, height: 1 };
    const r2 = { x: 1, y: 1, width: 1, height: 1 };
    expect(rectangle.equals(r, r)).toBe(true);
    expect(rectangle.equals(r, r2)).toBe(true);
  });
});

describe('intersection', () => {
  it('returns intersection rectangle', () => {
    const r3 = rectangle.create(5, 10, 10, 10);
    const result = rectangle.create();
    rectangle.intersection(result, r, r3);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
    expect(result.width).toBe(5);
    expect(result.height).toBe(10);
  });

  it('returns empty rectangle if no intersection', () => {
    const r3 = rectangle.create(20, 20, 5, 5);
    const result = rectangle.create();
    rectangle.intersection(result, r, r3);
    expect(rectangle.isEmpty(result)).toBe(true);
  });

  it('correctly modifies the original rectangle when intersection is empty', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    const r2 = rectangle.create(20, 20, 5, 5);
    const result = r1;
    rectangle.intersection(r1, r1, r2); // r1 is both source and target

    // Ensure the result is empty (since no intersection)
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);

    // Ensure r1 is also modified correctly (should be set to empty)
    expect(r1.width).toBe(0); // r1's width should be 0
    expect(r1.height).toBe(0); // r1's height should be 0
  });

  it('correctly modifies the target when intersection occurs', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    const r2 = rectangle.create(5, 5, 10, 10);
    const result = r1;
    rectangle.intersection(r1, r1, r2); // r1 is both source and target

    // Ensure r1 is correctly modified
    expect(result.width).toBe(5); // Correct intersection width
    expect(result.height).toBe(5); // Correct intersection height
    expect(r1.width).toBe(5); // Ensure r1 got updated
    expect(r1.height).toBe(5); // Ensure r1 got updated
  });

  it('allows rectangle-like objects', () => {
    const r3 = { x: 5, y: 10, width: 10, height: 10 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectangle.intersection(result, r, r3);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
    expect(result.width).toBe(5);
    expect(result.height).toBe(10);
  });
});

describe('intersects', () => {
  it('returns true if rectangles overlap', () => {
    const r3 = rectangle.create(5, 10, 10, 10);
    expect(rectangle.intersects(r, r3)).toBe(true);
  });

  it('returns false if rectangles do not overlap', () => {
    const r3 = rectangle.create(20, 20, 5, 5);
    expect(rectangle.intersects(r, r3)).toBe(false);
  });

  it('allows rectangle-like objects', () => {
    const r3 = { x: 5, y: 10, width: 10, height: 10 };
    expect(rectangle.intersects(r, r3)).toBe(true);
  });
});

describe('isEmpty', () => {
  it('returns true only for zero width or height', () => {
    expect(rectangle.isEmpty(r)).toBe(false);
    r.width = 0;
    expect(rectangle.isEmpty(r)).toBe(true);
    r.width = 10;
    r.height = 0;
    expect(rectangle.isEmpty(r)).toBe(true);
    r.width = -5;
    r.height = -5;
    expect(rectangle.isEmpty(r)).toBe(false); // flipped rectangles are valid
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectangle.isEmpty(r)).toBe(false);
    r.width = 0;
    expect(rectangle.isEmpty(r)).toBe(true);
  });
});

describe('offset', () => {
  it('moves rectangle', () => {
    const result = rectangle.create();
    rectangle.offset(result, r, 5, 10);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('correctly offsets the rectangle when it is both source and target', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    rectangle.offset(r1, r1, 5, 10); // r1 is both source and target

    // Ensure r1 is correctly offset
    expect(r1.x).toBe(5);
    expect(r1.y).toBe(10);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectangle.offset(result, r, 5, 10);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });
});

describe('offsetPoint', () => {
  it('moves rectangle by Vector2', () => {
    const out = rectangle.create();
    rectangle.offsetPoint(out, r, vector2.create(3, 4));
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });

  it('allows rectangle- and point-like objects', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    const p = { x: 3, y: 4 };
    const out = { x: 0, y: 0, width: 0, height: 0 };
    rectangle.offsetPoint(out, r, p);
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });
});

describe('inflate', () => {
  it('inflates rectangle by dx/dy', () => {
    const result = rectangle.create();
    rectangle.inflate(result, r, 2, 3);
    expect(result).not.toBe(r);
    expect(result.x).toBe(-2);
    expect(result.y).toBe(-3);
    expect(result.width).toBe(14);
    expect(result.height).toBe(26);
  });

  it('correctly inflates the rectangle when it is both source and target', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    rectangle.inflate(r1, r1, 2, 3); // r1 is both source and target

    // Ensure r1 is correctly inflated
    expect(r1.x).toBe(-2);
    expect(r1.y).toBe(-3);
    expect(r1.width).toBe(14);
    expect(r1.height).toBe(16);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 0, y: 0, width: 10, height: 20 };
    const result = { x: 0, y: 0, width: 0, height: 0 };
    rectangle.inflate(result, r, 2, 3);
    expect(result).not.toBe(r);
    expect(result.x).toBe(-2);
    expect(result.y).toBe(-3);
    expect(result.width).toBe(14);
    expect(result.height).toBe(26);
  });
});

describe('inflatePoint', () => {
  it('inflates rectangle by Vector2', () => {
    const result = rectangle.create();
    rectangle.inflatePoint(result, r, vector2.create(1, 2));
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
    rectangle.inflatePoint(result, r, p);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(-2);
    expect(result.width).toBe(12);
    expect(result.height).toBe(24);
  });
});

describe('normalized', () => {
  it('returns rectangle with positive width and height', () => {
    r.x = 10;
    r.y = 20;
    r.width = -5;
    r.height = -15;
    const n = rectangle.create();
    rectangle.normalized(n, r);
    expect(n.x).toBe(5);
    expect(n.y).toBe(5);
    expect(n.width).toBe(5);
    expect(n.height).toBe(15);
  });

  it('normalized of positive rectangle equals original', () => {
    const n = rectangle.create();
    rectangle.normalized(n, r);
    expect(n.x).toBe(r.x);
    expect(n.y).toBe(r.y);
    expect(n.width).toBe(r.width);
    expect(n.height).toBe(r.height);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    const n = { x: 0, y: 0, width: 0, height: 0 };
    rectangle.normalized(n, r);
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
    const ntl = vector2.create();
    rectangle.normalizedTopLeft(ntl, r);
    expect(ntl.x).toBe(5);
    expect(ntl.y).toBe(5);
  });

  it('match min/max for positive rectangles', () => {
    r.x = 2;
    r.y = 3;
    r.width = 10;
    r.height = 15;
    const ntl = vector2.create();
    rectangle.normalizedTopLeft(ntl, r);
    expect(ntl.x).toBe(rectangle.minX(r));
    expect(ntl.y).toBe(rectangle.minY(r));
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    let ntl = { x: 0, y: 0 };
    rectangle.normalizedTopLeft(ntl, r);
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
    const nbr = vector2.create();
    rectangle.normalizedBottomRight(nbr, r);
    expect(nbr.x).toBe(10);
    expect(nbr.y).toBe(20);
  });

  it('match min/max for positive rectangles', () => {
    r.x = 2;
    r.y = 3;
    r.width = 10;
    r.height = 15;
    const nbr = vector2.create();
    rectangle.normalizedBottomRight(nbr, r);
    expect(nbr.x).toBe(rectangle.maxX(r));
    expect(nbr.y).toBe(rectangle.maxY(r));
  });

  it('allows Rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    const nbr = { x: 0, y: 0 };
    rectangle.normalizedBottomRight(nbr, r);
    expect(nbr.x).toBe(10);
    expect(nbr.y).toBe(20);
  });
});

describe('set', () => {
  it('sets rectangle to specified values', () => {
    rectangle.setTo(r, 1, 2, 3, 4);
    expect(r.x).toBe(1);
    expect(r.y).toBe(2);
    expect(r.width).toBe(3);
    expect(r.height).toBe(4);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    rectangle.setTo(r, 1, 2, 3, 4);
    expect(r.x).toBe(1);
    expect(r.y).toBe(2);
    expect(r.width).toBe(3);
    expect(r.height).toBe(4);
  });
});

describe('setBottomRight', () => {
  it('adjusts width and height', () => {
    rectangle.setBottomRight(r, vector2.create(15, 25));
    expect(r.width).toBe(15);
    expect(r.height).toBe(25);
  });
});

describe('setEmpty', () => {
  it('sets rectangle to zero', () => {
    rectangle.setEmpty(r);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });

  it('allows rectangle-like objects', () => {
    const r = { x: 10, y: 20, width: -5, height: -15 };
    rectangle.setEmpty(r);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe('setLeft', () => {
  it('adjusts width correctly', () => {
    rectangle.setLeft(r, 5);
    expect(r.x).toBe(5);
    expect(r.width).toBe(5);
  });
});

describe('setSize', () => {
  it('setter adjusts width and height', () => {
    rectangle.setSize(r, vector2.create(5, 6));
    expect(r.width).toBe(5);
    expect(r.height).toBe(6);
  });
});

describe('setTop', () => {
  it('adjusts height correctly', () => {
    rectangle.setTop(r, 5);
    expect(r.y).toBe(5);
    expect(r.height).toBe(15);
  });

  it('can create negative height (flipped rectangle)', () => {
    rectangle.setTop(r, 25);
    expect(r.height).toBe(-5);
  });
});

describe('setTopLeft', () => {
  it('setter updates x and y', () => {
    const out = rectangle.create();
    rectangle.setTopLeft(out, vector2.create(3, 4));
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });

  it('allows point-like objects', () => {
    const r = { x: 0, y: 0, height: 0, width: 0 };
    let tl = { x: 10, y: 10 };
    rectangle.setTopLeft(r, tl);
    expect(r.x).toBe(10);
    expect(r.y).toBe(10);
  });
});

describe('setRight', () => {
  it('adjusts width', () => {
    rectangle.setRight(r, 15);
    expect(r.width).toBe(15);
  });

  it('accounts for x', () => {
    r.x = 10;
    rectangle.setRight(r, 15);
    expect(r.width).toBe(5);
  });

  it('can create negative width (flipped rectangle)', () => {
    rectangle.setRight(r, -5);
    expect(r.width).toBe(-5);
  });
});

describe('size', () => {
  it('returns width and height as Vector2', () => {
    const s = vector2.create();
    rectangle.size(s, r);
    expect(s.x).toBe(10);
    expect(s.y).toBe(20);
  });
});

describe('topLeft', () => {
  it('getter returns top-left Vector2', () => {
    const tl = vector2.create();
    rectangle.topLeft(tl, r);
    expect(tl.x).toBe(0);
    expect(tl.y).toBe(0);
  });

  it('allows point-like objects', () => {
    const r = { x: 0, y: 0, height: 0, width: 0 };
    let tl = { x: 0, y: 0 };
    rectangle.topLeft(tl, r);
    expect(tl.x).toBe(0);
    expect(tl.y).toBe(0);
  });
});

describe('union', () => {
  it('returns union of two rectangles', () => {
    const r3 = rectangle.create(5, 15, 10, 10);
    const u = rectangle.create();
    rectangle.union(u, r, r3);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.width).toBe(15);
    expect(u.height).toBe(25);
  });

  it('union works with zero-width rectangle', () => {
    const r3 = rectangle.create(5, 15, 0, 0);
    const u = rectangle.create();
    rectangle.union(u, r, r3);
    expect(rectangle.equals(u, r)).toBe(true);
  });

  it('union works with flipped rectangles', () => {
    const r3 = rectangle.create(15, 20, -10, -10);
    const u = rectangle.create();
    rectangle.union(u, r, r3);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.width).toBe(15);
    expect(u.height).toBe(20);
  });

  it('correctly modifies the target when union occurs', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    const r2 = rectangle.create(5, 5, 10, 10);
    const result = r1;
    rectangle.union(r1, r1, r2); // r1 is both source and target

    // Ensure r1 is correctly updated
    expect(result.width).toBe(15); // Correct union width
    expect(result.height).toBe(15); // Correct union height
    expect(r1.width).toBe(15); // r1 should be updated
    expect(r1.height).toBe(15); // r1 should be updated
  });

  it('correctly handles union of non-overlapping rectangles', () => {
    const r1 = rectangle.create(0, 0, 10, 10);
    const r2 = rectangle.create(20, 20, 5, 5);
    const result = r1;
    rectangle.union(r1, r1, r2); // r1 is both source and target

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
    rectangle.union(u, r, r3);
    expect(u.x).toBe(0);
    expect(u.y).toBe(0);
    expect(u.width).toBe(15);
    expect(u.height).toBe(25);
  });
});
