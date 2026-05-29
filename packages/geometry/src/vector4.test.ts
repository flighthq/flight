import {
  addVector4,
  cloneVector4,
  copyVector4,
  createVector3,
  createVector4,
  equalsVector4,
  getVector4AngleBetween,
  getVector4Distance,
  getVector4DistanceSquared,
  getVector4Dot,
  getVector4Length,
  getVector4LengthSquared,
  nearEqualsVector4,
  negateVector4,
  normalizeVector4,
  projectVector4,
  scaleVector4,
  setVector4,
  subtractVector4,
  VECTOR4_W_UNIT,
  VECTOR4_X_AXIS,
  VECTOR4_Y_AXIS,
  VECTOR4_Z_AXIS,
} from '@flighthq/geometry';
import type { Vector4 } from '@flighthq/types';

describe('createVector4', () => {
  it('creates a createVector4 with default values', () => {
    const v = createVector4();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
    expect(v.w).toBe(0);
  });

  it('creates a createVector4 with specified values', () => {
    const v = createVector4(1, 2, 3, 4);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
    expect(v.w).toBe(4);
  });
});

// Properties

describe('getVector4Length', () => {
  it('returns the length of the vector', () => {
    const v = createVector4(3, 4, 0, 12);
    expect(getVector4Length(v)).toBe(13);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0, w: 12 };
    expect(getVector4Length(v)).toBe(13);
  });
});

describe('getVector4LengthSquared', () => {
  it('returns the squared length of the vector', () => {
    const v = createVector4(3, 4, 0, 12);
    expect(getVector4LengthSquared(v)).toBe(169); // 3^2 + 4^2 + 12^2 = 169
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0, w: 12 };
    expect(getVector4LengthSquared(v)).toBe(169);
  });
});

describe('X_AXIS', () => {
  it('returns the unit vector along the X-axis', () => {
    const xAxis: Vector4 = VECTOR4_X_AXIS;
    expect(xAxis).not.toBeNull();
    expect(xAxis.x).toBe(1);
    expect(xAxis.y).toBe(0);
    expect(xAxis.z).toBe(0);
    expect(xAxis.w).toBe(0);
  });
});

describe('Y_AXIS', () => {
  it('returns the unit vector along the Y-axis', () => {
    const yAxis = VECTOR4_Y_AXIS;
    expect(yAxis).not.toBeNull();
    expect(yAxis.x).toBe(0);
    expect(yAxis.y).toBe(1);
    expect(yAxis.z).toBe(0);
    expect(yAxis.w).toBe(0);
  });
});

describe('Z_AXIS', () => {
  it('returns the unit vector along the Z-axis', () => {
    const zAxis = VECTOR4_Z_AXIS;
    expect(zAxis).not.toBeNull();
    expect(zAxis.x).toBe(0);
    expect(zAxis.y).toBe(0);
    expect(zAxis.z).toBe(1);
    expect(zAxis.w).toBe(0);
  });
});

describe('W_UNIT', () => {
  it('returns the unit vector along the W-dimension', () => {
    const wUnit = VECTOR4_W_UNIT;
    expect(wUnit).not.toBeNull();
    expect(wUnit.x).toBe(0);
    expect(wUnit.y).toBe(0);
    expect(wUnit.z).toBe(0);
    expect(wUnit.w).toBe(1);
  });
});

describe('addVector4', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector4(1, 2, 3, 10);
    const b = createVector4(4, 5, 6, 10);
    const result = createVector4();
    addVector4(result, a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
    expect(result.w).toBe(20);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector4(1, 2, 3, 4);
    addVector4(a, a, a); // passing the same object as both source and target
    expect(a.x).toBe(2);
    expect(a.y).toBe(4);
    expect(a.z).toBe(6);
    expect(a.w).toBe(8);
  });

  it('supports out === a', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(4, 5, 6, 7);
    addVector4(a, a, b);
    expect(a.x).toBe(5);
    expect(a.y).toBe(7);
    expect(a.z).toBe(9);
    expect(a.w).toBe(11);
  });

  it('supports out === b', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(4, 5, 6, 7);
    addVector4(b, a, b);
    expect(b.x).toBe(5);
    expect(b.y).toBe(7);
    expect(b.z).toBe(9);
    expect(b.w).toBe(11);
  });

  it('allows vector-like objects', () => {
    const a = { x: 1, y: 2, z: 3, w: 10 };
    const b = { x: 4, y: 5, z: 6, w: 10 };
    const result = { x: 0, y: 0, z: 0, w: 0 };
    addVector4(result, a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
    expect(result.w).toBe(20);
  });
});

describe('cloneVector4', () => {
  it('creates a new independent vector', () => {
    const original = createVector4(1, 2, 3, 4);
    const cloned: Vector4 = cloneVector4(original);
    expect(cloned).not.toBe(original); // ensures a new instance
    expect(cloned).not.toBeNull();
    expect(cloned.x).toBe(1);
    expect(cloned.y).toBe(2);
    expect(cloned.z).toBe(3);
    expect(cloned.w).toBe(4);
  });

  it('allows vector-like objects', () => {
    const original = { x: 1, y: 2, z: 3, w: 4 };
    const cloned: Vector4 = cloneVector4(original);
    expect(cloned).not.toBe(original); // ensures a new instance
    expect(cloned).not.toBeNull();
    expect(cloned.x).toBe(1);
    expect(cloned.y).toBe(2);
    expect(cloned.z).toBe(3);
    expect(cloned.w).toBe(4);
  });
});

describe('copyVector4', () => {
  it('copies values from source to target', () => {
    const source = createVector4(1, 2, 3, 4);
    const target = createVector4();
    copyVector4(target, source);
    expect(target.x).toBe(1);
    expect(target.y).toBe(2);
    expect(target.z).toBe(3);
    expect(target.w).toBe(4);
  });

  it('does not affect source when same object is used for input and output', () => {
    const vector = createVector4(1, 2, 3, 4);
    copyVector4(vector, vector);
    expect(vector.x).toBe(1);
    expect(vector.y).toBe(2);
    expect(vector.z).toBe(3);
    expect(vector.w).toBe(4);
  });
});

describe('getVector4Distance', () => {
  it('returns the distance between two vectors', () => {
    const a = createVector4(1, 1, 1, 1);
    const b = createVector4(4, 5, 6, 5);
    // dx=3, dy=4, dz=5, dw=4
    expect(getVector4Distance(a, b)).toBeCloseTo(Math.sqrt(66));
  });
});

describe('getVector4DistanceSquared', () => {
  it('returns the squared distance between two vectors', () => {
    const a = createVector4(1, 1, 1, 1);
    const b = createVector4(4, 5, 6, 5);
    // dx=3, dy=4, dz=5, dw=4
    expect(getVector4DistanceSquared(a, b)).toBe(66);
  });
});

describe('getVector4Dot', () => {
  it('returns the dot product of two vectors', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(4, 5, 6, 7);
    expect(getVector4Dot(a, b)).toBe(1 * 4 + 2 * 5 + 3 * 6 + 4 * 7);
  });
});

describe('equalsVector4', () => {
  it('returns true if vectors are equal', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(1, 2, 3, 4);
    expect(equalsVector4(a, b)).toBe(true);
  });

  it('returns false if vectors are not equal', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(4, 5, 6, 7);
    expect(equalsVector4(a, b)).toBe(false);
  });
});

describe('negateVector4', () => {
  it('inverts the values of the vector components', () => {
    const v = createVector4(1, -2, 3, -4);
    const result = createVector4();
    negateVector4(result, v);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(-3);
    expect(result.w).toBe(4);
  });

  it('supports out === source', () => {
    const v = createVector4(1, -2, 3, -4);
    negateVector4(v, v);
    expect(v.x).toBe(-1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(-3);
    expect(v.w).toBe(4);
  });
});

describe('normalizeVector4', () => {
  it('normalizes the vector', () => {
    const v = createVector4(3, 4, 0, 0);
    const result = createVector4();
    const length = normalizeVector4(result, v);
    expect(result.x).toBeCloseTo(0.6, 5);
    expect(result.y).toBeCloseTo(0.8, 5);
    expect(result.z).toBe(0);
    expect(result.w).toBe(0);
    expect(length).toBe(5);
  });

  it('supports out === source', () => {
    const v = createVector4(3, 4, 0, 0);
    const length = normalizeVector4(v, v);
    expect(v.x).toBeCloseTo(0.6, 5);
    expect(v.y).toBeCloseTo(0.8, 5);
    expect(v.z).toBe(0);
    expect(v.w).toBe(0);
    expect(length).toBe(5);
  });

  it('writes zero to out for a zero-length source', () => {
    const v = createVector4(0, 0, 0, 0);
    const result = createVector4(1, 2, 3, 4);
    const length = normalizeVector4(result, v);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
    expect(result.w).toBe(0);
    expect(length).toBe(0);
  });
});

describe('projectVector4', () => {
  it('modifies target when same object is passed as target', () => {
    const v = createVector4(10, 20, 30);
    v.w = 5;
    const result = createVector3();
    projectVector4(result, v);
    expect(result.x).toBe(2);
    expect(result.y).toBe(4);
    expect(result.z).toBe(6);
  });

  it('supports out === source', () => {
    const v = createVector4(10, 20, 30, 5);
    projectVector4(v, v);
    expect(v.x).toBe(2);
    expect(v.y).toBe(4);
    expect(v.z).toBe(6);
    expect(v.w).toBe(5);
  });
});

describe('scaleVector4', () => {
  it('scales the vector by a scalar', () => {
    const v = createVector4(1, 1, 1, 1);
    const result = createVector4();
    scaleVector4(result, v, 2);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.z).toBe(2);
    expect(result.w).toBe(2);
  });

  it('supports out === source', () => {
    const v = createVector4(1, 1, 1, 1);
    scaleVector4(v, v, 2);
    expect(v.x).toBe(2);
    expect(v.y).toBe(2);
    expect(v.z).toBe(2);
    expect(v.w).toBe(2);
  });
});

describe('setVector4', () => {
  it('sets the values of the vector', () => {
    const v = createVector4();
    setVector4(v, 5, 10, 15, 5);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    expect(v.z).toBe(15);
    expect(v.w).toBe(5);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector4(1, 2, 3, 4);
    setVector4(v, 5, 10, 15, 5);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    expect(v.z).toBe(15);
    expect(v.w).toBe(5);
  });
});

describe('subtractVector4', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector4(4, 5, 6, 7);
    const b = createVector4(1, 2, 3, 4);
    const result = createVector4();
    subtractVector4(result, a, b);
    expect(result.x).toBe(3);
    expect(result.y).toBe(3);
    expect(result.z).toBe(3);
    expect(result.w).toBe(3);
  });

  it('supports out === source', () => {
    const a = createVector4(4, 5, 6, 7);
    const b = createVector4(1, 2, 3, 4);
    subtractVector4(a, a, b);
    expect(a.x).toBe(3);
    expect(a.y).toBe(3);
    expect(a.z).toBe(3);
    expect(a.w).toBe(3);
  });

  it('supports out === other', () => {
    const a = createVector4(4, 5, 6, 7);
    const b = createVector4(1, 2, 3, 4);
    subtractVector4(b, a, b);
    expect(b.x).toBe(3);
    expect(b.y).toBe(3);
    expect(b.z).toBe(3);
    expect(b.w).toBe(3);
  });
});

describe('getVector4AngleBetween', () => {
  it('returns 0 for identical vectors', () => {
    const a = createVector4(1, 0, 0, 0);
    expect(getVector4AngleBetween(a, a)).toBeCloseTo(0);
  });

  it('returns PI/2 for perpendicular vectors', () => {
    const a = createVector4(1, 0, 0, 0);
    const b = createVector4(0, 1, 0, 0);
    expect(getVector4AngleBetween(a, b)).toBeCloseTo(Math.PI / 2);
  });

  it('returns NaN for a zero-length vector', () => {
    const a = createVector4(0, 0, 0, 0);
    const b = createVector4(1, 0, 0, 0);
    expect(getVector4AngleBetween(a, b)).toBeNaN();
  });
});

describe('nearEqualsVector4', () => {
  it('returns true for identical vectors', () => {
    const a = createVector4(1, 2, 3, 4);
    expect(nearEqualsVector4(a, a)).toBe(true);
  });

  it('returns true when difference is within default tolerance', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(1 + 1e-7, 2, 3, 4);
    expect(nearEqualsVector4(a, b)).toBe(true);
  });

  it('returns false when difference exceeds default tolerance', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(1 + 1e-5, 2, 3, 4);
    expect(nearEqualsVector4(a, b)).toBe(false);
  });

  it('respects a custom tolerance', () => {
    const a = createVector4(1, 2, 3, 4);
    const b = createVector4(1.05, 2, 3, 4);
    expect(nearEqualsVector4(a, b, 0.1)).toBe(true);
    expect(nearEqualsVector4(a, b, 0.01)).toBe(false);
  });
});
