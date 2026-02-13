import type { Vector2 } from '@flighthq/types';

import * as vector2 from './vector2.js';

let pt: Vector2;
let pt2: Vector2;

beforeEach(() => {
  pt = vector2.create();
  pt2 = vector2.create();
});

describe('create', () => {
  it('returns a Vector2 with default coordinates', () => {
    const p: Vector2 = vector2.create();
    expect(p).not.toBeNull();
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });

  it('sets the specified x and y coordinates', () => {
    const p = vector2.create(2, 4);
    expect(p.x).toBe(2);
    expect(p.y).toBe(4);
  });

  it('allows a vector-like object', () => {
    const p = { x: 2, y: 4 };
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
      expect(vector2.length(pt)).toBe(expected);
    }
  });

  it('allows a vector-like object', () => {
    for (const { x, y, expected } of testCases) {
      const pt = { x: x, y: y };
      expect(vector2.length(pt)).toBe(expected);
    }
  });
});

describe('lengthSquared', () => {
  it('returns the square of the length', () => {
    pt.x = 3;
    pt.y = 4;
    expect(vector2.lengthSquared(pt)).toBe(9 + 16); // 3^2 + 4^2 = 9 + 16 = 25
  });

  it('returns 0 for the origin (0, 0)', () => {
    expect(vector2.lengthSquared(pt)).toBe(0);
  });

  it('handles negative values correctly', () => {
    pt.x = -3;
    pt.y = -4;
    expect(vector2.lengthSquared(pt)).toBe(9 + 16); // 9 + 16 = 25
  });

  it('handles non-integer values', () => {
    pt.x = 2.5;
    pt.y = 4.5;
    expect(vector2.lengthSquared(pt)).toBe(2.5 * 2.5 + 4.5 * 4.5); // 6.25 + 20.25 = 26.5
  });

  it('allows a vector-like object', () => {
    const pt = { x: 3, y: 4 };
    expect(vector2.lengthSquared(pt)).toBe(9 + 16); // 3^2 + 4^2 = 9 + 16 = 25
  });
});

describe('add', () => {
  it('adds two coordinates', () => {
    pt.x = 2;
    pt.y = 10;
    pt2.x = 4;
    pt2.y = 20;

    const result = vector2.create();
    vector2.add(result, pt, pt2);
    expect(result.x).toBe(6);
    expect(result.y).toBe(30);
    expect(result).not.toBe(pt);
    expect(result).not.toBe(pt2);
  });

  it('works correctly if first vector is out', () => {
    pt.x = 3;
    pt.y = 7;
    pt2.x = 5;
    pt2.y = 10;

    vector2.add(pt, pt, pt2);
    expect(pt.x).toBe(8);
    expect(pt.y).toBe(17);
    expect(pt2.x).toBe(5);
    expect(pt2.y).toBe(10);
  });

  it('works correctly if second vector is out', () => {
    pt.x = 2;
    pt.y = 10;
    pt2.x = 4;
    pt2.y = 20;

    vector2.add(pt2, pt, pt2);
    expect(pt.x).toBe(2);
    expect(pt.y).toBe(10);
    expect(pt2.x).toBe(6);
    expect(pt2.y).toBe(30);
  });

  it('allows a vector-like object', () => {
    const pt = { x: 2, y: 10 };
    const pt2 = { x: 4, y: 20 };

    const result = { x: 0, y: 0 };
    vector2.add(result, pt, pt2);
    expect(result.x).toBe(6);
    expect(result.y).toBe(30);
    expect(result).not.toBe(pt);
    expect(result).not.toBe(pt2);
  });
});

describe('clone', () => {
  it('creates a copy of a vector', () => {
    pt.x = 1;
    pt.y = 2;
    const result = vector2.clone(pt);
    expect(result.x).toBe(pt.x);
    expect(result.y).toBe(pt.y);
  });

  it('returns a Vector2 instance', () => {
    const pt = { x: 1, y: 2 };
    const result: Vector2 = vector2.clone(pt);
    expect(result).not.toBeNull();
  });
});

describe('copy', () => {
  it('copies coordinates from one vector to another', () => {
    pt2.x = 1;
    pt2.y = 2;
    vector2.copy(pt, pt2);
    expect(pt.x).toBe(1);
    expect(pt.y).toBe(2);
  });

  it('allows a vector-like object', () => {
    const pt2 = { x: 1, y: 2 };
    vector2.copy(pt, pt2);
    expect(pt.x).toBe(1);
    expect(pt.y).toBe(2);
  });
});

describe('createPolar', () => {
  it('makes a vector2.create and calls polar', () => {
    const pt = vector2.createPolar(5, 0);
    vector2.setPolar(pt2, 5, 0);
    expect(vector2.equals(pt, pt2)).toBe(true);
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

  it('calculates Euclidean distance between vectors', () => {
    for (const { a, b, expected } of testCases) {
      pt.x = a[0];
      pt.y = a[1];
      pt2.x = b[0];
      pt2.y = b[1];
      expect(vector2.distance(pt, pt2)).toBe(expected);
    }
  });

  it('allows a vector-like object', () => {
    for (const { a, b, expected } of testCases) {
      const pt = { x: a[0], y: a[1] };
      const pt2 = { x: b[0], y: b[1] };
      expect(vector2.distance(pt, pt2)).toBe(expected);
    }
  });
});

describe('equals', () => {
  it('returns true if vectors are identical, false otherwise', () => {
    expect(vector2.equals(pt, pt2)).toBe(true);
    pt.x = 1;
    expect(vector2.equals(pt, pt2)).toBe(false);
    pt2.x = 1;
    expect(vector2.equals(pt, pt2)).toBe(true);
  });

  it('allows a vector-like object', () => {
    const pt2 = { x: 0, y: 0 };
    expect(vector2.equals(pt, pt2)).toBe(true);
    pt.x = 1;
    expect(vector2.equals(pt, pt2)).toBe(false);
    pt2.x = 1;
    expect(vector2.equals(pt, pt2)).toBe(true);
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
      const result = vector2.create();
      vector2.lerp(result, pt, pt2, t);
      expect(result.x).toBe(expected(pt.x, pt2.x));
      expect(result.y).toBe(expected(pt.y, pt2.y));
    }
  });

  it('works correctly if out is the first vector', () => {
    pt.x = 10;
    pt.y = 20;
    pt2.x = 30;
    pt2.y = 40;

    vector2.lerp(pt, pt, pt2, 0.5);
    expect(pt.x).toBe(20);
    expect(pt.y).toBe(30);
    expect(pt2.x).toBe(30);
    expect(pt2.y).toBe(40);
  });

  it('works correctly if out is the second vector', () => {
    pt.x = 10;
    pt.y = 20;
    pt2.x = 30;
    pt2.y = 40;

    vector2.lerp(pt2, pt, pt2, 0.5);
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

    const result = vector2.create();
    vector2.lerp(result, pt, pt2, 1000);
    expect(result.x).toBe(100000);
    expect(result.y).toBe(100000);
  });

  it('allows vector-like objects', () => {
    const pt = { x: 0, y: 0 };
    const pt2 = { x: 100, y: 100 };

    for (const { t, expected } of cases) {
      const result = { x: 0, y: 0 };
      vector2.lerp(result, pt, pt2, t);
      expect(result.x).toBe(expected(pt.x, pt2.x));
      expect(result.y).toBe(expected(pt.y, pt2.y));
    }
  });
});

describe('normalize', () => {
  it('scales a vector to the specified length', () => {
    const pt = vector2.create(3, 4);
    const result = vector2.create();
    vector2.normalize(result, pt, 10);
    expect(pt).not.toBe(result);
    expect(result.x).toBeCloseTo(6);
    expect(result.y).toBeCloseTo(8);
    expect(vector2.length(result)).toBeCloseTo(10);
  });

  it('returns zero for a zero-length vector', () => {
    const pt = vector2.create(0, 0);
    const result = vector2.create();
    vector2.normalize(result, pt, 5);
    expect(result).not.toBe(pt);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(vector2.length(result)).toBe(0);
  });

  it('scales vector to zero length', () => {
    const pt = vector2.create(3, 4);
    const result = vector2.create();
    vector2.normalize(result, pt, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(vector2.length(result)).toBe(0);
  });

  it('scales vector to length 1 (unit vector)', () => {
    const pt = vector2.create(0, 5);
    const result = vector2.create();
    vector2.normalize(result, pt, 1);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(1);
    expect(vector2.length(result)).toBeCloseTo(1);
  });

  it('scales vector to negative length', () => {
    const pt = vector2.create(3, 4);
    const result = vector2.create();
    vector2.normalize(result, pt, -10);
    expect(result.x).toBeCloseTo(-6);
    expect(result.y).toBeCloseTo(-8);
    expect(vector2.length(result)).toBeCloseTo(10); // length is magnitude
  });

  it('handles very small vectors correctly', () => {
    const pt = vector2.create(0.0001, 0.0001);
    const result = vector2.create();
    vector2.normalize(result, pt, 1);
    expect(result.x).toBeCloseTo(0.7071, 4);
    expect(result.y).toBeCloseTo(0.7071, 4);
  });

  it('allows a vector-like object', () => {
    const pt = { x: 3, y: 4 };
    const result = { x: 0, y: 0 };
    vector2.normalize(result, pt, 10);
    expect(pt).not.toBe(result);
    expect(result.x).toBeCloseTo(6);
    expect(result.y).toBeCloseTo(8);
    expect(vector2.length(result)).toBeCloseTo(10);
  });
});

describe('offset', () => {
  it('adjusts the value of a vector', () => {
    const result = vector2.create();
    vector2.offset(result, pt, 10, 100);
    expect(result.x).toBe(10);
    expect(result.y).toBe(100);
  });

  it('works with negative deltas', () => {
    const result = vector2.create();
    vector2.offset(result, pt, -5, -10);
    expect(result.x).toBe(-5);
    expect(result.y).toBe(-10);
  });

  it('allows a vector-like object', () => {
    const result = { x: 0, y: 0 };
    vector2.offset(result, pt, 10, 100);
    expect(result.x).toBe(10);
    expect(result.y).toBe(100);
  });
});

describe('set', () => {
  it('updates coordinates of a vector', () => {
    vector2.set(pt, 2, 10);
    expect(pt.x).toBe(2);
    expect(pt.y).toBe(10);
  });

  it('sets both coordinates to zero correctly', () => {
    pt.x = 1;
    pt.y = 2;
    vector2.set(pt, 0, 0);
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(0);
  });

  it('allows a vector-like object', () => {
    const pt = { x: 0, y: 0 };
    vector2.set(pt, 2, 10);
    expect(pt.x).toBe(2);
    expect(pt.y).toBe(10);
  });
});

describe('setPolar', () => {
  it('returns a vector at the given length along the x-axis when angle is 0', () => {
    const p = vector2.create();
    vector2.setPolar(p, 5, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(0);
    expect(vector2.length(p)).toBeCloseTo(5);
  });

  it('returns a vector at the given length along the y-axis when angle is π/2', () => {
    const p = vector2.create();
    vector2.setPolar(p, 3, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(3);
    expect(vector2.length(p)).toBeCloseTo(3);
  });

  it('returns a vector in the correct quadrant for angle π', () => {
    const p = vector2.create();
    vector2.setPolar(p, 4, Math.PI);
    expect(p.x).toBeCloseTo(-4);
    expect(p.y).toBeCloseTo(0);
    expect(vector2.length(p)).toBeCloseTo(4);
  });

  it('returns a vector in the correct quadrant for angle 3π/2', () => {
    const p = vector2.create();
    vector2.setPolar(p, 2, (3 * Math.PI) / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-2);
    expect(vector2.length(p)).toBeCloseTo(2);
  });

  it('handles zero length', () => {
    const p = vector2.create();
    vector2.setPolar(p, 0, Math.PI / 4);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(vector2.length(p)).toBeCloseTo(0);
  });

  it('handles negative length', () => {
    const p = vector2.create();
    vector2.setPolar(p, -5, 0);
    expect(p.x).toBeCloseTo(-5);
    expect(p.y).toBeCloseTo(0);
    expect(vector2.length(p)).toBeCloseTo(5); // length property is always positive
  });

  it('handles arbitrary angles', () => {
    const angle = Math.PI / 4; // 45 degrees
    const len = Math.sqrt(2);
    const p = vector2.create();
    vector2.setPolar(p, len, angle);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(1);
    expect(vector2.length(p)).toBeCloseTo(len);
  });

  it('allows vector-like objects', () => {
    const p = { x: 0, y: 0 };
    vector2.setPolar(p, 5, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(0);
  });
});

describe('subtract', () => {
  it('subtracts the coordinates of two vectors into a new vector', () => {
    pt.x = 5;
    pt.y = 10;
    pt2.x = 2;
    pt2.y = 4;

    const result = vector2.create();
    vector2.subtract(result, pt, pt2);

    expect(result.x).toBe(3);
    expect(result.y).toBe(6);
  });

  it('handles negative results correctly', () => {
    pt.x = 2;
    pt.y = 3;
    pt2.x = 5;
    pt2.y = 10;

    const result = vector2.create();
    vector2.subtract(result, pt, pt2);

    expect(result.x).toBe(-3);
    expect(result.y).toBe(-7);
  });

  it('returns zero when subtracting a vector from itself', () => {
    pt.x = 7;
    pt.y = -3;

    const result = vector2.create();
    vector2.subtract(result, pt, pt);

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('works when source or target vectors are at the origin', () => {
    pt.x = 0;
    pt.y = 0;
    pt2.x = 5;
    pt2.y = 10;

    const result = vector2.create();
    vector2.subtract(result, pt, pt2);
    expect(result.x).toBe(-5);
    expect(result.y).toBe(-10);

    const result2 = vector2.create();
    vector2.subtract(result2, pt2, pt);
    expect(result2.x).toBe(5);
    expect(result2.y).toBe(10);
  });

  it('works with very small values and results near zero', () => {
    pt.x = 0.0001;
    pt.y = 0.0001;
    pt2.x = 0.0001;
    pt2.y = 0.0001;

    const result = vector2.create();
    vector2.subtract(result, pt, pt2);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('allows vector-like objects', () => {
    const pt = { x: 5, y: 10 };
    const pt2 = { x: 2, y: 4 };

    const result = { x: 0, y: 0 };
    vector2.subtract(result, pt, pt2);

    expect(result.x).toBe(3);
    expect(result.y).toBe(6);

    // Ensure new object is returned
    expect(result).not.toBe(pt);
    expect(result).not.toBe(pt2);
  });
});
