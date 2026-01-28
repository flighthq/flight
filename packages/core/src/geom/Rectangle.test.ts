import Point from './Point.js';
import Rectangle from './Rectangle.js';

describe('Rectangle', () => {
  let r: Rectangle;
  let r2: Rectangle;

  beforeEach(() => {
    r = new Rectangle(0, 0, 10, 20);
    r2 = new Rectangle(2, 5, 3, 4);
  });

  // Constructor
  describe('constructor', () => {
    it('initializes with default values', () => {
      const rect = new Rectangle();
      expect(rect.x).toBe(0);
      expect(rect.y).toBe(0);
      expect(rect.width).toBe(0);
      expect(rect.height).toBe(0);
    });

    it('initializes with specified values', () => {
      const rect = new Rectangle(1, 2, 3, 4);
      expect(rect.x).toBe(1);
      expect(rect.y).toBe(2);
      expect(rect.width).toBe(3);
      expect(rect.height).toBe(4);
    });
  });

  // Properties
  describe('bottom', () => {
    it('returns y + height', () => {
      expect(r.bottom).toBe(20);
    });
  });

  describe('bottomRight', () => {
    it('returns correct Point', () => {
      const br = r.bottomRight;
      expect(br.x).toBe(10);
      expect(br.y).toBe(20);
    });

    it('setter adjusts width and height', () => {
      r.bottomRight = new Point(15, 25);
      expect(r.width).toBe(15);
      expect(r.height).toBe(25);
    });
  });

  describe('left', () => {
    it('getter returns x', () => {
      expect(r.left).toBe(0);
    });

    it('setter adjusts width correctly', () => {
      r.left = 5;
      expect(r.x).toBe(5);
      expect(r.width).toBe(5);
    });
  });

  describe('maxX', () => {
    it('returns correct maximum X for positive rectangle', () => {
      expect(r.maxX).toBe(10);
    });

    it('returns correct maximum X for flipped rectangle', () => {
      r.width = -5;
      expect(r.maxX).toBe(0);
    });
  });

  describe('maxY', () => {
    it('returns correct maximum Y for positive rectangle', () => {
      expect(r.maxY).toBe(20);
    });

    it('returns correct maximum Y for flipped rectangle', () => {
      r.height = -10;
      expect(r.maxY).toBe(0);
    });
  });

  describe('minX', () => {
    it('returns correct minimum X for positive rectangle', () => {
      expect(r.minX).toBe(0);
    });

    it('returns correct minimum X for flipped rectangle', () => {
      r.width = -5;
      expect(r.minX).toBe(-5);
    });
  });

  describe('minY', () => {
    it('returns correct minimum Y for positive rectangle', () => {
      expect(r.minY).toBe(0);
    });

    it('returns correct minimum Y for flipped rectangle', () => {
      r.height = -10;
      expect(r.minY).toBe(-10);
    });
  });

  describe('normalizedTopLeft', () => {
    it('return proper Points', () => {
      r.x = 10;
      r.y = 20;
      r.width = -5;
      r.height = -15;
      const ntl = r.normalizedTopLeft;
      expect(ntl.x).toBe(5);
      expect(ntl.y).toBe(5);
    });

    it('match min/max for positive rectangles', () => {
      r.x = 2;
      r.y = 3;
      r.width = 10;
      r.height = 15;
      const ntl = r.normalizedTopLeft;
      expect(ntl.x).toBe(r.minX);
      expect(ntl.y).toBe(r.minY);
    });
  });

  describe('normalizedBottomRight', () => {
    it('return proper Points', () => {
      r.x = 10;
      r.y = 20;
      r.width = -5;
      r.height = -15;
      const nbr = r.normalizedBottomRight;
      expect(nbr.x).toBe(10);
      expect(nbr.y).toBe(20);
    });

    it('match min/max for positive rectangles', () => {
      r.x = 2;
      r.y = 3;
      r.width = 10;
      r.height = 15;
      const nbr = r.normalizedBottomRight;
      expect(nbr.x).toBe(r.maxX);
      expect(nbr.y).toBe(r.maxY);
    });
  });

  describe('right', () => {
    it('getter returns x + width', () => {
      expect(r.right).toBe(10);
    });

    it('setter adjusts width', () => {
      r.right = 15;
      expect(r.width).toBe(15);
    });

    it('setter can create negative width (flipped rectangle)', () => {
      r.right = -5;
      expect(r.width).toBe(-5);
    });
  });

  describe('size', () => {
    it('getter returns width and height as Point', () => {
      const s = r.size;
      expect(s.x).toBe(10);
      expect(s.y).toBe(20);
    });

    it('setter adjusts width and height', () => {
      r.size = new Point(5, 6);
      expect(r.width).toBe(5);
      expect(r.height).toBe(6);
    });
  });

  describe('top', () => {
    it('getter returns y', () => {
      expect(r.top).toBe(0);
    });

    it('setter adjusts height correctly', () => {
      r.top = 5;
      expect(r.y).toBe(5);
      expect(r.height).toBe(15);
    });

    it('setter can create negative height (flipped rectangle)', () => {
      r.top = 25;
      expect(r.height).toBe(-5);
    });
  });

  describe('topLeft', () => {
    it('getter returns top-left Point', () => {
      const tl = r.topLeft;
      expect(tl.x).toBe(0);
      expect(tl.y).toBe(0);
    });

    it('setter updates x and y', () => {
      r.topLeft = new Point(3, 4);
      expect(r.x).toBe(3);
      expect(r.y).toBe(4);
    });
  });

  // Methods

  describe('clone', () => {
    it('clone creates a copy', () => {
      const c = Rectangle.clone(r);
      expect(Rectangle.equals(r, c)).toBe(true);
    });

    it('clone does not affect original rectangle', () => {
      const c = Rectangle.clone(r);
      c.x = 100;
      expect(r.x).not.toBe(c.x); // Original should remain unchanged
    });
  });

  describe('contains', () => {
    it('returns true for a point inside', () => {
      expect(Rectangle.contains(r, 5, 10)).toBe(true);
    });

    it('returns false for a point outside', () => {
      expect(Rectangle.contains(r, -1, 0)).toBe(false);
    });

    it('works with flipped rectangle', () => {
      r.width = -10;
      r.height = -20;
      expect(Rectangle.contains(r, -5, -10)).toBe(true);
    });
  });

  describe('containsPoint', () => {
    it('delegates to contains', () => {
      expect(Rectangle.containsPoint(r, new Point(5, 10))).toBe(true);
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
      expect(Rectangle.containsRect(r, r2)).toBe(true);
    });

    it('returns false if rectangle partially outside', () => {
      r2.x = -1; // partially outside on the left
      r2.y = 2;
      r2.width = 5;
      r2.height = 5;
      expect(Rectangle.containsRect(r, r2)).toBe(false);
    });

    it('works with flipped rectangle fully inside', () => {
      // Flipped rectangle: width and height negative
      r2.x = 5;
      r2.y = 6;
      r2.width = -3; // left edge at 2
      r2.height = -4; // top edge at 2
      expect(Rectangle.containsRect(r, r2)).toBe(true);
    });

    it('returns false if flipped rectangle exceeds bounds', () => {
      // Flipped rectangle exceeding bounds on left/top
      r2.x = 15;
      r2.y = 15;
      r2.width = -20; // left edge at -5
      r2.height = -20; // top edge at -5
      expect(Rectangle.containsRect(r, r2)).toBe(false);
    });

    it('works if flipped rectangle exactly fits inside', () => {
      // Flipped rectangle with exact bounds
      r2.x = 10;
      r2.y = 10;
      r2.width = -10; // left edge 0
      r2.height = -10; // top edge 0
      expect(Rectangle.containsRect(r, r2)).toBe(true);
    });

    it('returns false if zero-size rectangle outside', () => {
      r2.x = 20;
      r2.y = 20;
      r2.width = 0;
      r2.height = 0;
      expect(Rectangle.containsRect(r, r2)).toBe(false);
    });

    it('returns true if zero-size rectangle exactly on a corner', () => {
      r2.x = 0;
      r2.y = 0;
      r2.width = 0;
      r2.height = 0;
      expect(Rectangle.containsRect(r, r2)).toBe(true);
    });
  });

  describe('copyFrom', () => {
    it('copyFrom copies values', () => {
      Rectangle.copyFrom(r2, r);
      expect(Rectangle.equals(r, r2)).toBe(true);
    });

    describe('copyFrom with same rectangle as source and target', () => {
      it('does not change the original values if source and target are the same', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        Rectangle.copyFrom(r1, r1); // r1 is both source and target

        // Ensure no changes occur
        expect(r1.x).toBe(0);
        expect(r1.y).toBe(0);
        expect(r1.width).toBe(10);
        expect(r1.height).toBe(10);
      });
    });
  });

  describe('equals', () => {
    it('returns true for identical rectangles', () => {
      expect(Rectangle.equals(r, r)).toBe(true);
      expect(Rectangle.equals(r, Rectangle.clone(r))).toBe(true);
    });

    it('returns false for different rectangles', () => {
      r2.x = 1;
      expect(Rectangle.equals(r, r2)).toBe(false);
    });
  });

  describe('intersection', () => {
    it('returns intersection rectangle', () => {
      const r3 = new Rectangle(5, 10, 10, 10);
      const result = Rectangle.intersection(r, r3);
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
      expect(result.width).toBe(5);
      expect(result.height).toBe(10);
    });

    it('returns empty rectangle if no intersection', () => {
      const r3 = new Rectangle(20, 20, 5, 5);
      const result = Rectangle.intersection(r, r3);
      expect(Rectangle.isEmpty(result)).toBe(true);
    });

    describe('intersection with same rectangle as target', () => {
      it('correctly modifies the original rectangle when intersection is empty', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        const r2 = new Rectangle(20, 20, 5, 5);
        const result = Rectangle.intersection(r1, r2, r1); // r1 is both source and target

        // Ensure the result is empty (since no intersection)
        expect(result.width).toBe(0);
        expect(result.height).toBe(0);

        // Ensure r1 is also modified correctly (should be set to empty)
        expect(r1.width).toBe(0); // r1's width should be 0
        expect(r1.height).toBe(0); // r1's height should be 0
      });

      it('correctly modifies the target when intersection occurs', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        const r2 = new Rectangle(5, 5, 10, 10);
        const result = Rectangle.intersection(r1, r2, r1); // r1 is both source and target

        // Ensure r1 is correctly modified
        expect(result.width).toBe(5); // Correct intersection width
        expect(result.height).toBe(5); // Correct intersection height
        expect(r1.width).toBe(5); // Ensure r1 got updated
        expect(r1.height).toBe(5); // Ensure r1 got updated
      });
    });
  });

  describe('intersects', () => {
    it('returns true if rectangles overlap', () => {
      const r3 = new Rectangle(5, 10, 10, 10);
      expect(Rectangle.intersects(r, r3)).toBe(true);
    });

    it('returns false if rectangles do not overlap', () => {
      const r3 = new Rectangle(20, 20, 5, 5);
      expect(Rectangle.intersects(r, r3)).toBe(false);
    });
  });

  describe('isEmpty', () => {
    it('returns true only for zero width or height', () => {
      expect(Rectangle.isEmpty(r)).toBe(false);
      r.width = 0;
      expect(Rectangle.isEmpty(r)).toBe(true);
      r.width = 10;
      r.height = 0;
      expect(Rectangle.isEmpty(r)).toBe(true);
      r.width = -5;
      r.height = -5;
      expect(Rectangle.isEmpty(r)).toBe(false); // flipped rectangles are valid
    });
  });

  describe('offset', () => {
    it('offset moves rectangle', () => {
      Rectangle.offset(r, 5, 10);
      expect(r.x).toBe(5);
      expect(r.y).toBe(10);
    });

    describe('offset with same rectangle as source and target', () => {
      it('correctly offsets the rectangle when it is both source and target', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        Rectangle.offset(r1, 5, 10); // r1 is both source and target

        // Ensure r1 is correctly offset
        expect(r1.x).toBe(5);
        expect(r1.y).toBe(10);
      });
    });
  });

  describe('offsetPoint', () => {
    it('offsetPoint moves rectangle by Point', () => {
      Rectangle.offsetPoint(r, new Point(3, 4));
      expect(r.x).toBe(3);
      expect(r.y).toBe(4);
    });
  });

  describe('inflate', () => {
    it('inflates rectangle by dx/dy', () => {
      Rectangle.inflate(r, 2, 3);
      expect(r.x).toBe(-2);
      expect(r.y).toBe(-3);
      expect(r.width).toBe(14);
      expect(r.height).toBe(26);
    });

    describe('inflate with same rectangle as source and target', () => {
      it('correctly inflates the rectangle when it is both source and target', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        Rectangle.inflate(r1, 2, 3); // r1 is both source and target

        // Ensure r1 is correctly inflated
        expect(r1.x).toBe(-2);
        expect(r1.y).toBe(-3);
        expect(r1.width).toBe(14);
        expect(r1.height).toBe(16);
      });
    });
  });

  describe('inflatePoint', () => {
    it('inflates rectangle by Point', () => {
      Rectangle.inflatePoint(r, new Point(1, 2));
      expect(r.x).toBe(-1);
      expect(r.y).toBe(-2);
      expect(r.width).toBe(12);
      expect(r.height).toBe(24);
    });
  });

  describe('normalized', () => {
    it('returns rectangle with positive width and height', () => {
      r.x = 10;
      r.y = 20;
      r.width = -5;
      r.height = -15;
      const n = Rectangle.normalized(r);
      expect(n.x).toBe(5);
      expect(n.y).toBe(5);
      expect(n.width).toBe(5);
      expect(n.height).toBe(15);
    });

    it('normalized of positive rectangle equals original', () => {
      const n = Rectangle.normalized(r);
      expect(n.x).toBe(r.x);
      expect(n.y).toBe(r.y);
      expect(n.width).toBe(r.width);
      expect(n.height).toBe(r.height);
    });
  });

  describe('setEmpty', () => {
    it('sets rectangle to zero', () => {
      Rectangle.setEmpty(r);
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      expect(r.width).toBe(0);
      expect(r.height).toBe(0);
    });
  });

  describe('setTo', () => {
    it('sets rectangle to specified values', () => {
      Rectangle.setTo(r, 1, 2, 3, 4);
      expect(r.x).toBe(1);
      expect(r.y).toBe(2);
      expect(r.width).toBe(3);
      expect(r.height).toBe(4);
    });
  });

  describe('toString', () => {
    it('returns the correct string representation', () => {
      const rect = new Rectangle(1, 2, 3, 4);
      expect(rect.toString()).toBe('(x=1, y=2, width=3, height=4)');
    });
  });

  describe('union', () => {
    it('returns union of two rectangles', () => {
      const r3 = new Rectangle(5, 15, 10, 10);
      const u = Rectangle.union(r, r3);
      expect(u.x).toBe(0);
      expect(u.y).toBe(0);
      expect(u.width).toBe(15);
      expect(u.height).toBe(25);
    });

    it('union works with zero-width rectangle', () => {
      const r3 = new Rectangle(5, 15, 0, 0);
      const u = Rectangle.union(r, r3);
      expect(Rectangle.equals(u, r)).toBe(true);
    });

    it('union works with flipped rectangles', () => {
      const r3 = new Rectangle(15, 20, -10, -10);
      const u = Rectangle.union(r, r3);
      expect(u.x).toBe(0);
      expect(u.y).toBe(0);
      expect(u.width).toBe(15);
      expect(u.height).toBe(20);
    });

    describe('union with same rectangle as target', () => {
      it('correctly modifies the target when union occurs', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        const r2 = new Rectangle(5, 5, 10, 10);
        const result = Rectangle.union(r1, r2, r1); // r1 is both source and target

        // Ensure r1 is correctly updated
        expect(result.width).toBe(15); // Correct union width
        expect(result.height).toBe(15); // Correct union height
        expect(r1.width).toBe(15); // r1 should be updated
        expect(r1.height).toBe(15); // r1 should be updated
      });

      it('correctly handles union of non-overlapping rectangles', () => {
        const r1 = new Rectangle(0, 0, 10, 10);
        const r2 = new Rectangle(20, 20, 5, 5);
        const result = Rectangle.union(r1, r2, r1); // r1 is both source and target

        // Ensure r1 is correctly updated
        expect(result.width).toBe(25); // Correct union width
        expect(result.height).toBe(25); // Correct union height
        expect(r1.width).toBe(25); // r1 should be updated
        expect(r1.height).toBe(25); // r1 should be updated
      });
    });
  });
});
