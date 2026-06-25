import {
  addVector3,
  clampVector3,
  cloneVector3,
  copyVector3,
  createVector3,
  createVector3FromSpherical,
  crossVector3,
  divideVector3,
  equalsVector3,
  getVector3AngleBetween,
  getVector3Distance,
  getVector3DistanceSquared,
  getVector3Dot,
  getVector3Length,
  getVector3LengthSquared,
  getVector3Spherical,
  interpolateVector3,
  maxVector3,
  minVector3,
  multiplyVector3,
  nearEqualsVector3,
  negateVector3,
  normalizeVector3,
  offsetVector3,
  projectVector3,
  reflectVector3,
  scaleVector3,
  setVector3,
  setVector3FromFloat32Array,
  setVector3FromSpherical,
  setVector3FromVector4,
  subtractVector3,
  transformVector3ByMatrix3,
  VECTOR3_X_AXIS,
  VECTOR3_Y_AXIS,
  VECTOR3_Z_AXIS,
  writeVector3ToFloat32Array,
} from '@flighthq/geometry';
import type { Vector3 } from '@flighthq/types';

describe('addVector3', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    const result = createVector3();
    addVector3(result, a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector3(1, 2, 3);
    addVector3(a, a, a); // passing the same object as both source and target
    expect(a.x).toBe(2);
    expect(a.y).toBe(4);
    expect(a.z).toBe(6);
  });

  it('supports out === a', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    addVector3(a, a, b);
    expect(a.x).toBe(5);
    expect(a.y).toBe(7);
    expect(a.z).toBe(9);
  });

  it('supports out === b', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    addVector3(b, a, b);
    expect(b.x).toBe(5);
    expect(b.y).toBe(7);
    expect(b.z).toBe(9);
  });

  it('allows vector-like objects', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: 5, z: 6 };
    const result = { x: 0, y: 0, z: 0 };
    addVector3(result, a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
  });
});

describe('clampVector3', () => {
  it('clamps each component independently', () => {
    const out = createVector3();
    clampVector3(out, createVector3(5, -2, 1), createVector3(0, 0, 0), createVector3(3, 3, 3));
    expect(out.x).toBe(3);
    expect(out.y).toBe(0);
    expect(out.z).toBe(1);
  });

  it('supports out === value', () => {
    const v = createVector3(5, -1, 7);
    clampVector3(v, v, createVector3(0, 0, 0), createVector3(3, 3, 3));
    expect(v.x).toBe(3);
    expect(v.y).toBe(0);
    expect(v.z).toBe(3);
  });
});

describe('cloneVector3', () => {
  it('creates a new independent vector', () => {
    const original = createVector3(1, 2, 3);
    const cloned: Vector3 = cloneVector3(original);
    expect(cloned).not.toBe(original); // ensures a new instance
    expect(cloned).not.toBeNull();
    expect(cloned.x).toBe(1);
    expect(cloned.y).toBe(2);
    expect(cloned.z).toBe(3);
  });

  it('allows vector-like objects', () => {
    const original = { x: 1, y: 2, z: 3 };
    const cloned: Vector3 = cloneVector3(original);
    expect(cloned).not.toBe(original); // ensures a new instance
    expect(cloned).not.toBeNull();
    expect(cloned.x).toBe(1);
    expect(cloned.y).toBe(2);
    expect(cloned.z).toBe(3);
  });
});

describe('copyVector3', () => {
  it('copies values from source to target', () => {
    const source = createVector3(1, 2, 3);
    const target = createVector3();
    copyVector3(target, source);
    expect(target.x).toBe(1);
    expect(target.y).toBe(2);
    expect(target.z).toBe(3);
  });

  it('does not affect source when same object is used for input and output', () => {
    const vector = createVector3(1, 2, 3);
    copyVector3(vector, vector);
    expect(vector.x).toBe(1);
    expect(vector.y).toBe(2);
    expect(vector.z).toBe(3);
  });
});

describe('createVector3', () => {
  it('creates a createVector3 with default values', () => {
    const v = createVector3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('creates a createVector3 with specified values', () => {
    const v = createVector3(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });
});

describe('createVector3FromSpherical', () => {
  it('produces the correct cartesian point', () => {
    const v = createVector3FromSpherical(1, Math.PI / 2, 0);
    expect(v.x).toBeCloseTo(1, 6);
    expect(v.y).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(0, 6);
  });

  it('round-trips with getVector3Spherical', () => {
    const v = createVector3FromSpherical(2, Math.PI / 3, Math.PI / 4);
    const sph = createVector3();
    getVector3Spherical(sph, v);
    expect(sph.x).toBeCloseTo(2, 5);
    expect(sph.y).toBeCloseTo(Math.PI / 3, 5);
    expect(sph.z).toBeCloseTo(Math.PI / 4, 5);
  });
});

describe('crossVector3', () => {
  it('returns the cross product of two vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    const result = createVector3();
    crossVector3(result, a, b);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(1);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    crossVector3(a, a, b); // passing the same object as both source and target
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(a.z).toBe(1);
  });

  it('supports out === other', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    crossVector3(b, a, b);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
    expect(b.z).toBe(1);
  });
});

describe('divideVector3', () => {
  it('divides component-wise', () => {
    const out = createVector3();
    divideVector3(out, createVector3(6, 8, 9), createVector3(2, 4, 3));
    expect(out.x).toBe(3);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });

  it('produces 0 for zero divisor components', () => {
    const out = createVector3();
    divideVector3(out, createVector3(6, 8, 9), createVector3(0, 4, 0));
    expect(out.x).toBe(0);
    expect(out.y).toBe(2);
    expect(out.z).toBe(0);
  });

  it('supports out === source', () => {
    const v = createVector3(6, 8, 9);
    divideVector3(v, v, createVector3(2, 4, 3));
    expect(v.x).toBe(3);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });
});

describe('equalsVector3', () => {
  it('returns true if vectors are equal', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1, 2, 3);
    expect(equalsVector3(a, b)).toBe(true);
  });

  it('returns false if vectors are not equal', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    expect(equalsVector3(a, b)).toBe(false);
  });
});

describe('getVector3AngleBetween', () => {
  it('returns 0 for identical vectors', () => {
    const a = createVector3(1, 0, 0);
    expect(getVector3AngleBetween(a, a)).toBeCloseTo(0);
  });

  it('returns PI/2 for perpendicular vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    expect(getVector3AngleBetween(a, b)).toBeCloseTo(Math.PI / 2);
  });

  it('returns PI for opposite vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(-1, 0, 0);
    expect(getVector3AngleBetween(a, b)).toBeCloseTo(Math.PI);
  });

  it('returns NaN for a zero-length vector', () => {
    const a = createVector3(0, 0, 0);
    const b = createVector3(1, 0, 0);
    expect(getVector3AngleBetween(a, b)).toBeNaN();
  });
});

describe('getVector3Distance', () => {
  it('returns the distance between two vectors', () => {
    const a = createVector3(1, 1, 1);
    const b = createVector3(4, 5, 6);
    expect(getVector3Distance(a, b)).toBeCloseTo(7.071068, 5);
  });
});

describe('getVector3DistanceSquared', () => {
  it('returns the squared distance between two vectors', () => {
    const a = createVector3(1, 1, 1);
    const b = createVector3(4, 5, 6);
    expect(getVector3DistanceSquared(a, b)).toBe(50);
  });
});

describe('getVector3Dot', () => {
  it('returns the dot product of two vectors', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    expect(getVector3Dot(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
  });
});

describe('getVector3Length', () => {
  it('returns the length of the vector', () => {
    const v = createVector3(3, 4, 0);
    expect(getVector3Length(v)).toBe(5);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(getVector3Length(v)).toBe(5);
  });
});

describe('getVector3LengthSquared', () => {
  it('returns the squared length of the vector', () => {
    const v = createVector3(3, 4, 0);
    expect(getVector3LengthSquared(v)).toBe(25);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(getVector3LengthSquared(v)).toBe(25);
  });
});

describe('getVector3Spherical', () => {
  it('returns radius, theta, phi for a known point', () => {
    const v = createVector3(1, 0, 0);
    const sph = createVector3();
    getVector3Spherical(sph, v);
    expect(sph.x).toBeCloseTo(1, 6); // radius
    expect(sph.y).toBeCloseTo(Math.PI / 2, 6); // theta (from +Y)
    expect(sph.z).toBeCloseTo(0, 6); // phi
  });

  it('handles zero vector', () => {
    const sph = createVector3();
    getVector3Spherical(sph, createVector3(0, 0, 0));
    expect(sph.x).toBe(0);
    expect(sph.y).toBe(0);
    expect(sph.z).toBe(0);
  });
});

describe('interpolateVector3', () => {
  it('returns a at t=0 and b at t=1', () => {
    const out = createVector3();
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    interpolateVector3(out, a, b, 0);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
    interpolateVector3(out, a, b, 1);
    expect(out.x).toBe(4);
    expect(out.y).toBe(5);
    expect(out.z).toBe(6);
  });

  it('interpolates midpoint at t=0.5', () => {
    const out = createVector3();
    interpolateVector3(out, createVector3(0, 0, 0), createVector3(2, 4, 6), 0.5);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });

  it('supports out === a', () => {
    const a = createVector3(0, 0, 0);
    const b = createVector3(2, 4, 6);
    interpolateVector3(a, a, b, 0.5);
    expect(a.x).toBe(1);
    expect(a.y).toBe(2);
    expect(a.z).toBe(3);
  });
});

describe('maxVector3', () => {
  it('returns the component-wise maximum', () => {
    const out = createVector3();
    maxVector3(out, createVector3(1, 5, 2), createVector3(3, 2, 7));
    expect(out.x).toBe(3);
    expect(out.y).toBe(5);
    expect(out.z).toBe(7);
  });
});

describe('minVector3', () => {
  it('returns the component-wise minimum', () => {
    const out = createVector3();
    minVector3(out, createVector3(1, 5, 2), createVector3(3, 2, 7));
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(2);
  });
});

describe('multiplyVector3', () => {
  it('multiplies component-wise (Hadamard)', () => {
    const out = createVector3();
    multiplyVector3(out, createVector3(2, 3, 4), createVector3(5, 6, 7));
    expect(out.x).toBe(10);
    expect(out.y).toBe(18);
    expect(out.z).toBe(28);
  });

  it('supports out === a', () => {
    const a = createVector3(2, 3, 4);
    multiplyVector3(a, a, createVector3(5, 6, 7));
    expect(a.x).toBe(10);
    expect(a.y).toBe(18);
    expect(a.z).toBe(28);
  });
});

describe('nearEqualsVector3', () => {
  it('returns true for identical vectors', () => {
    const a = createVector3(1, 2, 3);
    expect(nearEqualsVector3(a, a)).toBe(true);
  });

  it('returns true when difference is within default tolerance', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1 + 1e-7, 2, 3);
    expect(nearEqualsVector3(a, b)).toBe(true);
  });

  it('returns false when difference exceeds default tolerance', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1 + 1e-5, 2, 3);
    expect(nearEqualsVector3(a, b)).toBe(false);
  });

  it('respects a custom tolerance', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1.05, 2, 3);
    expect(nearEqualsVector3(a, b, 0.1)).toBe(true);
    expect(nearEqualsVector3(a, b, 0.01)).toBe(false);
  });
});

describe('negateVector3', () => {
  it('inverts the values of the vector components', () => {
    const v = createVector3(1, -2, 3);
    const result = createVector3();
    negateVector3(result, v);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(-3);
  });

  it('supports out === source', () => {
    const v = createVector3(1, -2, 3);
    negateVector3(v, v);
    expect(v.x).toBe(-1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(-3);
  });
});

describe('normalizeVector3', () => {
  it('normalizes the vector', () => {
    const v = createVector3(3, 4, 0);
    const result = createVector3();
    const length = normalizeVector3(result, v);
    expect(result.x).toBeCloseTo(0.6, 5);
    expect(result.y).toBeCloseTo(0.8, 5);
    expect(result.z).toBe(0);
    expect(length).toBe(5);
  });

  it('supports out === source', () => {
    const v = createVector3(3, 4, 0);
    const length = normalizeVector3(v, v);
    expect(v.x).toBeCloseTo(0.6, 5);
    expect(v.y).toBeCloseTo(0.8, 5);
    expect(v.z).toBe(0);
    expect(length).toBe(5);
  });

  it('writes zero to out for a zero-length source', () => {
    const v = createVector3(0, 0, 0);
    const result = createVector3(1, 2, 3);
    const length = normalizeVector3(result, v);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
    expect(length).toBe(0);
  });
});

describe('offsetVector3', () => {
  it('offsets each component by a scalar per axis', () => {
    const v = createVector3(1, 2, 3);
    const result = createVector3();
    offsetVector3(result, v, 10, 20, 30);
    expect(result.x).toBe(11);
    expect(result.y).toBe(22);
    expect(result.z).toBe(33);
  });

  it('works with negative deltas', () => {
    const v = createVector3(1, 2, 3);
    const result = createVector3();
    offsetVector3(result, v, -5, -10, -15);
    expect(result.x).toBe(-4);
    expect(result.y).toBe(-8);
    expect(result.z).toBe(-12);
  });

  it('supports out === source', () => {
    const v = createVector3(1, 2, 3);
    offsetVector3(v, v, 3, 4, 5);
    expect(v.x).toBe(4);
    expect(v.y).toBe(6);
    expect(v.z).toBe(8);
  });
});

describe('projectVector3', () => {
  it('divides x and y by z to produce a 2D point', () => {
    const v = createVector3(4, 6, 2);
    const out = { x: 0, y: 0 };
    projectVector3(out, v);
    expect(out.x).toBe(2);
    expect(out.y).toBe(3);
  });

  it('returns the original xy when z is 1', () => {
    const v = createVector3(5, 7, 1);
    const out = { x: 0, y: 0 };
    projectVector3(out, v);
    expect(out.x).toBe(5);
    expect(out.y).toBe(7);
  });

  it('supports out === source', () => {
    const v = createVector3(4, 6, 2);
    projectVector3(v, v);
    expect(v.x).toBe(2);
    expect(v.y).toBe(3);
    expect(v.z).toBe(2);
  });
});

describe('reflectVector3', () => {
  it('reflects incident vector about the x-axis normal', () => {
    const out = createVector3();
    // Reflect (1, -1, 0) about normal (1, 0, 0): result should be (-1, -1, 0)
    reflectVector3(out, createVector3(1, -1, 0), createVector3(1, 0, 0));
    expect(out.x).toBeCloseTo(-1, 6);
    expect(out.y).toBeCloseTo(-1, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('reflecting a downward vector about upward normal gives upward', () => {
    const out = createVector3();
    reflectVector3(out, createVector3(0, -1, 0), createVector3(0, 1, 0));
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('supports out === incident', () => {
    const v = createVector3(1, -1, 0);
    reflectVector3(v, v, createVector3(1, 0, 0));
    expect(v.x).toBeCloseTo(-1, 6);
    expect(v.y).toBeCloseTo(-1, 6);
  });
});

describe('scaleVector3', () => {
  it('scales the vector by a scalar', () => {
    const v = createVector3(1, 1, 1);
    const result = createVector3();
    scaleVector3(result, v, 2);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.z).toBe(2);
  });

  it('supports out === source', () => {
    const v = createVector3(1, 1, 1);
    scaleVector3(v, v, 2);
    expect(v.x).toBe(2);
    expect(v.y).toBe(2);
    expect(v.z).toBe(2);
  });
});

describe('setVector3', () => {
  it('sets the values of the vector', () => {
    const v = createVector3();
    setVector3(v, 5, 10, 15);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    expect(v.z).toBe(15);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(1, 2, 3);
    setVector3(v, 5, 10, 15);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    expect(v.z).toBe(15);
  });
});

describe('setVector3FromFloat32Array', () => {
  it('reads x/y/z from the array at offset', () => {
    const arr = new Float32Array([0, 1, 2, 3, 4]);
    const out = createVector3();
    setVector3FromFloat32Array(out, 1, arr);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });
});

describe('setVector3FromSpherical', () => {
  it('produces the north pole at theta=0', () => {
    const out = createVector3();
    setVector3FromSpherical(out, 5, 0, 0);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(5, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });
});

describe('setVector3FromVector4', () => {
  it('copies x, y, z and drops w', () => {
    const src = { x: 1, y: 2, z: 3, w: 99 };
    const out = createVector3();
    setVector3FromVector4(out, src);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.z).toBe(3);
  });

  it('does not perform a perspective divide', () => {
    const src = { x: 2, y: 4, z: 6, w: 2 };
    const out = createVector3();
    setVector3FromVector4(out, src);
    // Should NOT divide by w
    expect(out.x).toBe(2);
    expect(out.y).toBe(4);
    expect(out.z).toBe(6);
  });
});

describe('subtractVector3', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector3(4, 5, 6);
    const b = createVector3(1, 2, 3);
    const result = createVector3();
    subtractVector3(result, a, b);
    expect(result.x).toBe(3);
    expect(result.y).toBe(3);
    expect(result.z).toBe(3);
  });

  it('supports out === source', () => {
    const a = createVector3(4, 5, 6);
    const b = createVector3(1, 2, 3);
    subtractVector3(a, a, b);
    expect(a.x).toBe(3);
    expect(a.y).toBe(3);
    expect(a.z).toBe(3);
  });

  it('supports out === other', () => {
    const a = createVector3(4, 5, 6);
    const b = createVector3(1, 2, 3);
    subtractVector3(b, a, b);
    expect(b.x).toBe(3);
    expect(b.y).toBe(3);
    expect(b.z).toBe(3);
  });
});

describe('transformVector3ByMatrix3', () => {
  it('transforms by an identity matrix', () => {
    const identity = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = createVector3();
    transformVector3ByMatrix3(out, createVector3(1, 2, 3), identity);
    expect(out.x).toBeCloseTo(1, 6);
    expect(out.y).toBeCloseTo(2, 6);
    expect(out.z).toBeCloseTo(3, 6);
  });

  it('transforms by a scale matrix', () => {
    const scale = { m: new Float32Array([2, 0, 0, 0, 3, 0, 0, 0, 4]) };
    const out = createVector3();
    transformVector3ByMatrix3(out, createVector3(1, 1, 1), scale);
    expect(out.x).toBeCloseTo(2, 6);
    expect(out.y).toBeCloseTo(3, 6);
    expect(out.z).toBeCloseTo(4, 6);
  });

  it('supports out === source', () => {
    const identity = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const v = createVector3(1, 2, 3);
    transformVector3ByMatrix3(v, v, identity);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });
});

describe('writeVector3ToFloat32Array', () => {
  it('writes x/y/z to the array at offset', () => {
    const arr = new Float32Array(5);
    writeVector3ToFloat32Array(arr, 1, createVector3(1, 2, 3));
    expect(arr[0]).toBe(0);
    expect(arr[1]).toBe(1);
    expect(arr[2]).toBe(2);
    expect(arr[3]).toBe(3);
  });
});

describe('X_AXIS', () => {
  it('returns the unit vector along the X-axis', () => {
    const xAxis: Vector3 = VECTOR3_X_AXIS;
    expect(xAxis).not.toBeNull();
    expect(xAxis.x).toBe(1);
    expect(xAxis.y).toBe(0);
    expect(xAxis.z).toBe(0);
  });
});

describe('Y_AXIS', () => {
  it('returns the unit vector along the Y-axis', () => {
    const yAxis: Vector3 = VECTOR3_Y_AXIS;
    expect(yAxis).not.toBeNull();
    expect(yAxis.x).toBe(0);
    expect(yAxis.y).toBe(1);
    expect(yAxis.z).toBe(0);
  });
});

describe('Z_AXIS', () => {
  it('returns the unit vector along the Z-axis', () => {
    const zAxis: Vector3 = VECTOR3_Z_AXIS;
    expect(zAxis).not.toBeNull();
    expect(zAxis.x).toBe(0);
    expect(zAxis.y).toBe(0);
    expect(zAxis.z).toBe(1);
  });
});
