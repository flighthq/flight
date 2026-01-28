import Point from './Point.js';

describe('Point', () => {
  let pt: Point;
  let pt2: Point;

  beforeEach(() => {
    pt = new Point();
    pt2 = new Point();
  });

  // Constructor

  describe('constructor', () => {
    it('returns a Point with default coordinates', () => {
      const p = new Point();
      expect(p).toBeInstanceOf(Point);
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    });

    it('sets the specified x and y coordinates', () => {
      const p = new Point(2, 4);
      expect(p.x).toBe(2);
      expect(p.y).toBe(4);
    });
  });

  // Properties

  describe('length', () => {
    const testCases = [
      { x: 100, y: 0, expected: 100 },
      { x: 0, y: 100, expected: 100 },
      { x: 3, y: 4, expected: 5 },
      { x: 5, y: 12, expected: 13 },
      { x: 8, y: 15, expected: 17 },
    ];

    it('returns the length of the vector', () => {
      for (const { x, y, expected } of testCases) {
        pt.x = x;
        pt.y = y;
        expect(pt.length).toBe(expected);
      }
    });
  });

  describe('lengthSquared', () => {
    it('returns the square of the length', () => {
      pt.x = 3;
      pt.y = 4;
      expect(pt.lengthSquared).toBe(9 + 16); // 3^2 + 4^2 = 9 + 16 = 25
    });

    it('returns 0 for the origin (0, 0)', () => {
      expect(pt.lengthSquared).toBe(0);
    });

    it('handles negative values correctly', () => {
      pt.x = -3;
      pt.y = -4;
      expect(pt.lengthSquared).toBe(9 + 16); // 9 + 16 = 25
    });

    it('handles non-integer values', () => {
      pt.x = 2.5;
      pt.y = 4.5;
      expect(pt.lengthSquared).toBe(2.5 * 2.5 + 4.5 * 4.5); // 6.25 + 20.25 = 26.5
    });
  });

  // Methods

  describe('add', () => {
    it('returns a new point with coordinates added', () => {
      pt.x = 2;
      pt.y = 10;
      pt2.x = 4;
      pt2.y = 20;

      const result = Point.add(pt, pt2);
      expect(result.x).toBe(6);
      expect(result.y).toBe(30);
      expect(result).not.toBe(pt);
      expect(result).not.toBe(pt2);
    });
  });

  describe('addTo', () => {
    it('returns a new point with coordinates added', () => {
      pt.x = 2;
      pt.y = 10;
      pt2.x = 4;
      pt2.y = 20;

      const result = new Point();
      Point.addTo(result, pt, pt2);
      expect(result.x).toBe(6);
      expect(result.y).toBe(30);
      expect(result).not.toBe(pt);
      expect(result).not.toBe(pt2);
    });

    it('works correctly if first point is out', () => {
      pt.x = 3;
      pt.y = 7;
      pt2.x = 5;
      pt2.y = 10;

      Point.addTo(pt, pt, pt2);
      expect(pt.x).toBe(8);
      expect(pt.y).toBe(17);
      expect(pt2.x).toBe(5);
      expect(pt2.y).toBe(10);
    });

    it('works correctly if second point is out', () => {
      pt.x = 2;
      pt.y = 10;
      pt2.x = 4;
      pt2.y = 20;

      Point.addTo(pt2, pt, pt2);
      expect(pt.x).toBe(2);
      expect(pt.y).toBe(10);
      expect(pt2.x).toBe(6);
      expect(pt2.y).toBe(30);
    });
  });

  describe('clone', () => {
    it('creates a copy of a point', () => {
      pt.x = 1;
      pt.y = 2;
      const result = Point.clone(pt);
      expect(result.x).toBe(pt.x);
      expect(result.y).toBe(pt.y);
    });
  });

  describe('copyFrom', () => {
    it('copies coordinates from one point to another', () => {
      pt2.x = 1;
      pt2.y = 2;
      Point.copyFrom(pt2, pt);
      expect(pt.x).toBe(1);
      expect(pt.y).toBe(2);
    });
  });

  describe('copyTo', () => {
    it('copies coordinates from one point to another', () => {
      pt2.x = 1;
      pt2.y = 2;
      Point.copyTo(pt, pt2);
      expect(pt.x).toBe(1);
      expect(pt.y).toBe(2);
    });
  });

  describe('distance', () => {
    const testCases = [
      { a: [100, 0], b: [0, 0], expected: 100 },
      { a: [0, 100], b: [0, 0], expected: 100 },
      { a: [3, 4], b: [0, 0], expected: 5 },
      { a: [5, 12], b: [0, 0], expected: 13 },
      { a: [8, 15], b: [0, 0], expected: 17 },
    ];

    it('calculates Euclidean distance between points', () => {
      for (const { a, b, expected } of testCases) {
        pt.x = a[0];
        pt.y = a[1];
        pt2.x = b[0];
        pt2.y = b[1];
        expect(Point.distance(pt, pt2)).toBe(expected);
      }
    });
  });

  describe('equals', () => {
    it('returns true if points are identical, false otherwise', () => {
      expect(Point.equals(pt, pt2)).toBe(true);
      pt.x = 1;
      expect(Point.equals(pt, pt2)).toBe(false);
      pt2.x = 1;
      expect(Point.equals(pt, pt2)).toBe(true);
    });
  });

  describe('interpolate', () => {
    it('produces the same result as lerp with reversed argument order', () => {
      pt.x = 0;
      pt.y = 0;
      pt2.x = 100;
      pt2.y = 100;

      const result = Point.interpolate(pt2, pt, 1);
      const expected = new Point();
      Point.lerp(expected, pt, pt2, 1);

      expect(result.x).toBe(expected.x);
      expect(result.y).toBe(expected.y);
    });
  });

  describe('interpolateTo', () => {
    it('produces the same result as lerp with reversed argument order', () => {
      pt.x = 0;
      pt.y = 0;
      pt2.x = 100;
      pt2.y = 100;

      const result = new Point();
      Point.interpolateTo(result, pt2, pt, 1);
      const expected = new Point();
      Point.lerp(expected, pt, pt2, 1);

      expect(result.x).toBe(expected.x);
      expect(result.y).toBe(expected.y);
    });
  });

  describe('lerp', () => {
    const cases = [
      { t: 0, expected: (a: number, _: number) => a },
      { t: 1, expected: (_: number, b: number) => b },
      { t: 0.5, expected: (a: number, b: number) => (a + b) / 2 },
      { t: 10, expected: (a: number, b: number) => a + (b - a) * 10 },
      { t: -1, expected: (a: number, b: number) => a + (b - a) * -1 },
    ];

    it('interpolates and extrapolates correctly', () => {
      pt.x = 0;
      pt.y = 0;
      pt2.x = 100;
      pt2.y = 100;

      for (const { t, expected } of cases) {
        const result = new Point();
        Point.lerp(result, pt, pt2, t);
        expect(result.x).toBe(expected(pt.x, pt2.x));
        expect(result.y).toBe(expected(pt.y, pt2.y));
      }
    });

    it('works correctly if out is the first point', () => {
      pt.x = 10;
      pt.y = 20;
      pt2.x = 30;
      pt2.y = 40;

      Point.lerp(pt, pt, pt2, 0.5);
      expect(pt.x).toBe(20);
      expect(pt.y).toBe(30);
      expect(pt2.x).toBe(30);
      expect(pt2.y).toBe(40);
    });

    it('works correctly if out is the second point', () => {
      pt.x = 10;
      pt.y = 20;
      pt2.x = 30;
      pt2.y = 40;

      Point.lerp(pt2, pt, pt2, 0.5);
      expect(pt.x).toBe(10);
      expect(pt.y).toBe(20);
      expect(pt2.x).toBe(20);
      expect(pt2.y).toBe(30);
    });

    it('handles extreme extrapolation values for t', () => {
      pt.x = 0;
      pt.y = 0;
      pt2.x = 100;
      pt2.y = 100;

      const result = new Point();
      Point.lerp(result, pt, pt2, 1000);
      expect(result.x).toBe(100000);
      expect(result.y).toBe(100000);
    });
  });

  describe('normalize', () => {
    it('scales a vector to the specified length', () => {
      const pt = new Point(3, 4);
      Point.normalize(pt, 10);
      expect(pt.x).toBeCloseTo(6);
      expect(pt.y).toBeCloseTo(8);
      expect(pt.length).toBeCloseTo(10);
    });

    it('returns zero for a zero-length vector', () => {
      const pt = new Point(0, 0);
      Point.normalize(pt, 5);
      expect(pt.x).toBe(0);
      expect(pt.y).toBe(0);
      expect(pt.length).toBe(0);
    });

    it('scales vector to zero length', () => {
      const pt = new Point(3, 4);
      Point.normalize(pt, 0);
      expect(pt.x).toBe(0);
      expect(pt.y).toBe(0);
      expect(pt.length).toBe(0);
    });

    it('scales vector to length 1 (unit vector)', () => {
      const pt = new Point(0, 5);
      Point.normalize(pt, 1);
      expect(pt.x).toBeCloseTo(0);
      expect(pt.y).toBeCloseTo(1);
      expect(pt.length).toBeCloseTo(1);
    });

    it('scales vector to negative length', () => {
      const pt = new Point(3, 4);
      Point.normalize(pt, -10);
      expect(pt.x).toBeCloseTo(-6);
      expect(pt.y).toBeCloseTo(-8);
      expect(pt.length).toBeCloseTo(10); // length is magnitude
    });

    it('handles very small vectors correctly', () => {
      const pt = new Point(0.0001, 0.0001);
      Point.normalize(pt, 1);
      expect(pt.x).toBeCloseTo(0.7071, 4);
      expect(pt.y).toBeCloseTo(0.7071, 4);
    });
  });

  describe('normalizeTo', () => {
    it('scales a vector to the specified length', () => {
      const pt = new Point(3, 4);
      const result = new Point();
      Point.normalizeTo(result, pt, 10);
      expect(pt).not.toBe(result);
      expect(result.x).toBeCloseTo(6);
      expect(result.y).toBeCloseTo(8);
      expect(result.length).toBeCloseTo(10);
    });

    it('returns zero for a zero-length vector', () => {
      const pt = new Point(0, 0);
      const result = new Point();
      Point.normalizeTo(result, pt, 5);
      expect(result).not.toBe(pt);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.length).toBe(0);
    });

    it('scales vector to zero length', () => {
      const pt = new Point(3, 4);
      const result = new Point();
      Point.normalizeTo(result, pt, 0);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.length).toBe(0);
    });

    it('scales vector to length 1 (unit vector)', () => {
      const pt = new Point(0, 5);
      const result = new Point();
      Point.normalizeTo(result, pt, 1);
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(1);
      expect(result.length).toBeCloseTo(1);
    });

    it('scales vector to negative length', () => {
      const pt = new Point(3, 4);
      const result = new Point();
      Point.normalizeTo(result, pt, -10);
      expect(result.x).toBeCloseTo(-6);
      expect(result.y).toBeCloseTo(-8);
      expect(result.length).toBeCloseTo(10); // length is magnitude
    });

    it('handles very small vectors correctly', () => {
      const pt = new Point(0.0001, 0.0001);
      const result = new Point();
      Point.normalizeTo(result, pt, 1);
      expect(result.x).toBeCloseTo(0.7071, 4);
      expect(result.y).toBeCloseTo(0.7071, 4);
    });
  });

  describe('offset', () => {
    it('adjusts the value of a point', () => {
      Point.offset(pt, 10, 100);
      expect(pt.x).toBe(10);
      expect(pt.y).toBe(100);
    });

    it('works with negative deltas', () => {
      Point.offset(pt, -5, -10);
      expect(pt.x).toBe(-5);
      expect(pt.y).toBe(-10);
    });
  });

  describe('offsetTo', () => {
    it('adjusts the value of a point', () => {
      const result = new Point();
      Point.offsetTo(result, pt, 10, 100);
      expect(result.x).toBe(10);
      expect(result.y).toBe(100);
    });

    it('works with negative deltas', () => {
      const result = new Point();
      Point.offsetTo(result, pt, -5, -10);
      expect(result.x).toBe(-5);
      expect(result.y).toBe(-10);
    });
  });

  describe('polar', () => {
    it('returns a point at the given length along the x-axis when angle is 0', () => {
      const p = Point.polar(5, 0);
      expect(p.x).toBeCloseTo(5);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(5);
    });

    it('returns a point at the given length along the y-axis when angle is π/2', () => {
      const p = Point.polar(3, Math.PI / 2);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(3);
      expect(p.length).toBeCloseTo(3);
    });

    it('returns a point in the correct quadrant for angle π', () => {
      const p = Point.polar(4, Math.PI);
      expect(p.x).toBeCloseTo(-4);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(4);
    });

    it('returns a point in the correct quadrant for angle 3π/2', () => {
      const p = Point.polar(2, (3 * Math.PI) / 2);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(-2);
      expect(p.length).toBeCloseTo(2);
    });

    it('handles zero length', () => {
      const p = Point.polar(0, Math.PI / 4);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(0);
    });

    it('handles negative length', () => {
      const p = Point.polar(-5, 0);
      expect(p.x).toBeCloseTo(-5);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(5); // length property is always positive
    });

    it('handles arbitrary angles', () => {
      const angle = Math.PI / 4; // 45 degrees
      const len = Math.sqrt(2);
      const p = Point.polar(len, angle);
      expect(p.x).toBeCloseTo(1);
      expect(p.y).toBeCloseTo(1);
      expect(p.length).toBeCloseTo(len);
    });
  });

  describe('polarTo', () => {
    it('returns a point at the given length along the x-axis when angle is 0', () => {
      const p = new Point();
      Point.polarTo(p, 5, 0);
      expect(p.x).toBeCloseTo(5);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(5);
    });

    it('returns a point at the given length along the y-axis when angle is π/2', () => {
      const p = new Point();
      Point.polarTo(p, 3, Math.PI / 2);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(3);
      expect(p.length).toBeCloseTo(3);
    });

    it('returns a point in the correct quadrant for angle π', () => {
      const p = new Point();
      Point.polarTo(p, 4, Math.PI);
      expect(p.x).toBeCloseTo(-4);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(4);
    });

    it('returns a point in the correct quadrant for angle 3π/2', () => {
      const p = new Point();
      Point.polarTo(p, 2, (3 * Math.PI) / 2);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(-2);
      expect(p.length).toBeCloseTo(2);
    });

    it('handles zero length', () => {
      const p = new Point();
      Point.polarTo(p, 0, Math.PI / 4);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(0);
    });

    it('handles negative length', () => {
      const p = new Point();
      Point.polarTo(p, -5, 0);
      expect(p.x).toBeCloseTo(-5);
      expect(p.y).toBeCloseTo(0);
      expect(p.length).toBeCloseTo(5); // length property is always positive
    });

    it('handles arbitrary angles', () => {
      const angle = Math.PI / 4; // 45 degrees
      const len = Math.sqrt(2);
      const p = new Point();
      Point.polarTo(p, len, angle);
      expect(p.x).toBeCloseTo(1);
      expect(p.y).toBeCloseTo(1);
      expect(p.length).toBeCloseTo(len);
    });
  });

  describe('setTo', () => {
    it('updates coordinates of a point', () => {
      Point.setTo(pt, 2, 10);
      expect(pt.x).toBe(2);
      expect(pt.y).toBe(10);
    });

    it('sets both coordinates to zero correctly', () => {
      pt.x = 1;
      pt.y = 2;
      Point.setTo(pt, 0, 0);
      expect(pt.x).toBe(0);
      expect(pt.y).toBe(0);
    });
  });

  describe('subtract', () => {
    it('subtracts the coordinates of two points into a new point', () => {
      pt.x = 5;
      pt.y = 10;
      pt2.x = 2;
      pt2.y = 4;

      const result = Point.subtract(pt, pt2);

      expect(result.x).toBe(3);
      expect(result.y).toBe(6);

      // Ensure new object is returned
      expect(result).not.toBe(pt);
      expect(result).not.toBe(pt2);
    });

    it('handles negative results correctly', () => {
      pt.x = 2;
      pt.y = 3;
      pt2.x = 5;
      pt2.y = 10;

      const result = Point.subtract(pt, pt2);

      expect(result.x).toBe(-3);
      expect(result.y).toBe(-7);
    });

    it('returns zero when subtracting a point from itself', () => {
      pt.x = 7;
      pt.y = -3;

      const result = Point.subtract(pt, pt);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('works when source or target points are at the origin', () => {
      pt.x = 0;
      pt.y = 0;
      pt2.x = 5;
      pt2.y = 10;

      let result = Point.subtract(pt, pt2);
      expect(result.x).toBe(-5);
      expect(result.y).toBe(-10);

      result = Point.subtract(pt2, pt);
      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
    });

    it('works with very small values and results near zero', () => {
      pt.x = 0.0001;
      pt.y = 0.0001;
      pt2.x = 0.0001;
      pt2.y = 0.0001;

      const result = Point.subtract(pt, pt2);
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(0);
    });
  });

  describe('subtractTo', () => {
    it('subtracts the coordinates of two points into a new point', () => {
      pt.x = 5;
      pt.y = 10;
      pt2.x = 2;
      pt2.y = 4;

      const result = new Point();
      Point.subtractTo(result, pt, pt2);

      expect(result.x).toBe(3);
      expect(result.y).toBe(6);

      // Ensure new object is returned
      expect(result).not.toBe(pt);
      expect(result).not.toBe(pt2);
    });

    it('handles negative results correctly', () => {
      pt.x = 2;
      pt.y = 3;
      pt2.x = 5;
      pt2.y = 10;

      const result = new Point();
      Point.subtractTo(result, pt, pt2);

      expect(result.x).toBe(-3);
      expect(result.y).toBe(-7);
    });

    it('returns zero when subtracting a point from itself', () => {
      pt.x = 7;
      pt.y = -3;

      const result = new Point();
      Point.subtractTo(result, pt, pt);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('works when source or target points are at the origin', () => {
      pt.x = 0;
      pt.y = 0;
      pt2.x = 5;
      pt2.y = 10;

      const result = new Point();
      Point.subtractTo(result, pt, pt2);
      expect(result.x).toBe(-5);
      expect(result.y).toBe(-10);

      const result2 = new Point();
      Point.subtractTo(result2, pt2, pt);
      expect(result2.x).toBe(5);
      expect(result2.y).toBe(10);
    });

    it('works with very small values and results near zero', () => {
      pt.x = 0.0001;
      pt.y = 0.0001;
      pt2.x = 0.0001;
      pt2.y = 0.0001;

      const result = new Point();
      Point.subtractTo(result, pt, pt2);
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(0);
    });
  });

  describe('toString', () => {
    it('returns a string in the format "(x=..., y=...)"', () => {
      pt.x = 3;
      pt.y = 4;
      expect(pt.toString()).toBe('(x=3, y=4)');
    });

    it('handles negative and zero values', () => {
      pt.x = 0;
      pt.y = -5;
      expect(pt.toString()).toBe('(x=0, y=-5)');
    });
  });
});
