import {
  createVector3,
  VEC3_X_AXIS,
  VEC3_Y_AXIS,
  VEC3_Z_AXIS,
  vec3Add,
  vec3AngleBetween,
  vec3Clone,
  vec3Copy,
  vec3Cross,
  vec3Distance,
  vec3DistanceSquared,
  vec3Dot,
  vec3Equals,
  vec3Length,
  vec3LengthSquared,
  vec3NearEquals,
  vec3Negate,
  vec3Normalize,
  vec3Project,
  vec3Scale,
  vec3SetTo,
  vec3Subtract,
} from '@flighthq/geometry';
import type { Vector3 } from '@flighthq/types';

describe('create', () => {
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

// Properties

describe('length', () => {
  it('returns the length of the vector', () => {
    const v = createVector3(3, 4, 0);
    expect(vec3Length(v)).toBe(5);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(vec3Length(v)).toBe(5);
  });
});

describe('lengthSquared', () => {
  it('returns the squared length of the vector', () => {
    const v = createVector3(3, 4, 0);
    expect(vec3LengthSquared(v)).toBe(25);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(vec3LengthSquared(v)).toBe(25);
  });
});

describe('X_AXIS', () => {
  it('returns the unit vector along the X-axis', () => {
    const xAxis: Vector3 = VEC3_X_AXIS;
    expect(xAxis).not.toBeNull();
    expect(xAxis.x).toBe(1);
    expect(xAxis.y).toBe(0);
    expect(xAxis.z).toBe(0);
  });
});

describe('Y_AXIS', () => {
  it('returns the unit vector along the Y-axis', () => {
    const yAxis: Vector3 = VEC3_Y_AXIS;
    expect(yAxis).not.toBeNull();
    expect(yAxis.x).toBe(0);
    expect(yAxis.y).toBe(1);
    expect(yAxis.z).toBe(0);
  });
});

describe('Z_AXIS', () => {
  it('returns the unit vector along the Z-axis', () => {
    const zAxis: Vector3 = VEC3_Z_AXIS;
    expect(zAxis).not.toBeNull();
    expect(zAxis.x).toBe(0);
    expect(zAxis.y).toBe(0);
    expect(zAxis.z).toBe(1);
  });
});

describe('add', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    const result = createVector3();
    vec3Add(result, a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector3(1, 2, 3);
    vec3Add(a, a, a); // passing the same object as both source and target
    expect(a.x).toBe(2);
    expect(a.y).toBe(4);
    expect(a.z).toBe(6);
  });

  it('allows vector-like objects', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: 5, z: 6 };
    const result = { x: 0, y: 0, z: 0 };
    vec3Add(result, a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
  });
});

describe('clone', () => {
  it('creates a new independent vector', () => {
    const original = createVector3(1, 2, 3);
    const cloned: Vector3 = vec3Clone(original);
    expect(cloned).not.toBe(original); // ensures a new instance
    expect(cloned).not.toBeNull();
    expect(cloned.x).toBe(1);
    expect(cloned.y).toBe(2);
    expect(cloned.z).toBe(3);
  });

  it('allows vector-like objects', () => {
    const original = { x: 1, y: 2, z: 3 };
    const cloned: Vector3 = vec3Clone(original);
    expect(cloned).not.toBe(original); // ensures a new instance
    expect(cloned).not.toBeNull();
    expect(cloned.x).toBe(1);
    expect(cloned.y).toBe(2);
    expect(cloned.z).toBe(3);
  });
});

describe('copy', () => {
  it('copies values from source to target', () => {
    const source = createVector3(1, 2, 3);
    const target = createVector3();
    vec3Copy(target, source);
    expect(target.x).toBe(1);
    expect(target.y).toBe(2);
    expect(target.z).toBe(3);
  });

  it('does not affect source when same object is used for input and output', () => {
    const vector = createVector3(1, 2, 3);
    vec3Copy(vector, vector);
    expect(vector.x).toBe(1);
    expect(vector.y).toBe(2);
    expect(vector.z).toBe(3);
  });
});

describe('cross', () => {
  it('returns the cross product of two vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    const result = createVector3();
    vec3Cross(result, a, b);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(1);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    vec3Cross(a, a, b); // passing the same object as both source and target
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(a.z).toBe(1);
  });
});

describe('distance', () => {
  it('returns the distance between two vectors', () => {
    const a = createVector3(1, 1, 1);
    const b = createVector3(4, 5, 6);
    expect(vec3Distance(a, b)).toBeCloseTo(7.071068, 5);
  });
});

describe('distanceSquared', () => {
  it('returns the squared distance between two vectors', () => {
    const a = createVector3(1, 1, 1);
    const b = createVector3(4, 5, 6);
    expect(vec3DistanceSquared(a, b)).toBe(50);
  });
});

describe('dot', () => {
  it('returns the dot product of two vectors', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    expect(vec3Dot(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
  });
});

describe('equals', () => {
  it('returns true if vectors are equal', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1, 2, 3);
    expect(vec3Equals(a, b)).toBe(true);
  });

  it('returns false if vectors are not equal', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    expect(vec3Equals(a, b)).toBe(false);
  });
});

describe('negate', () => {
  it('inverts the values of the vector components', () => {
    const v = createVector3(1, -2, 3);
    const result = createVector3();
    vec3Negate(result, v);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(-3);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(1, -2, 3);
    const result = createVector3();
    vec3Negate(result, v);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(-3);
  });
});

describe('normalize', () => {
  it('normalizes the vector', () => {
    const v = createVector3(3, 4, 0);
    const result = createVector3();
    const length = vec3Normalize(result, v);
    expect(result.x).toBeCloseTo(0.6, 5);
    expect(result.y).toBeCloseTo(0.8, 5);
    expect(result.z).toBe(0);
    expect(length).toBe(5);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(3, 4, 0);
    const result = createVector3();
    const length = vec3Normalize(result, v);
    expect(result.x).toBeCloseTo(0.6, 5);
    expect(result.y).toBeCloseTo(0.8, 5);
    expect(result.z).toBe(0);
    expect(length).toBe(5);
  });
});

describe('scale', () => {
  it('scales the vector by a scalar', () => {
    const v = createVector3(1, 1, 1);
    const result = createVector3();
    vec3Scale(result, v, 2);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.z).toBe(2);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(1, 1, 1);
    const result = createVector3();
    vec3Scale(result, v, 2);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.z).toBe(2);
  });
});

describe('setTo', () => {
  it('sets the values of the vector', () => {
    const v = createVector3();
    vec3SetTo(v, 5, 10, 15);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    expect(v.z).toBe(15);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(1, 2, 3);
    vec3SetTo(v, 5, 10, 15);
    expect(v.x).toBe(5);
    expect(v.y).toBe(10);
    expect(v.z).toBe(15);
  });
});

describe('subtract', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector3(4, 5, 6);
    const b = createVector3(1, 2, 3);
    const result = createVector3();
    vec3Subtract(result, a, b);
    expect(result.x).toBe(3);
    expect(result.y).toBe(3);
    expect(result.z).toBe(3);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector3(4, 5, 6);
    const result = createVector3();
    vec3Subtract(result, a, a); // passing the same object as both source and target
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });
});

describe('angleBetween', () => {
  it('returns 0 for identical vectors', () => {
    const a = createVector3(1, 0, 0);
    expect(vec3AngleBetween(a, a)).toBeCloseTo(0);
  });

  it('returns PI/2 for perpendicular vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    expect(vec3AngleBetween(a, b)).toBeCloseTo(Math.PI / 2);
  });

  it('returns PI for opposite vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(-1, 0, 0);
    expect(vec3AngleBetween(a, b)).toBeCloseTo(Math.PI);
  });

  it('returns NaN for a zero-length vector', () => {
    const a = createVector3(0, 0, 0);
    const b = createVector3(1, 0, 0);
    expect(vec3AngleBetween(a, b)).toBeNaN();
  });
});

describe('nearEquals', () => {
  it('returns true for identical vectors', () => {
    const a = createVector3(1, 2, 3);
    expect(vec3NearEquals(a, a)).toBe(true);
  });

  it('returns true when difference is within default tolerance', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1 + 1e-7, 2, 3);
    expect(vec3NearEquals(a, b)).toBe(true);
  });

  it('returns false when difference exceeds default tolerance', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1 + 1e-5, 2, 3);
    expect(vec3NearEquals(a, b)).toBe(false);
  });

  it('respects a custom tolerance', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(1.05, 2, 3);
    expect(vec3NearEquals(a, b, 0.1)).toBe(true);
    expect(vec3NearEquals(a, b, 0.01)).toBe(false);
  });
});

describe('project', () => {
  it('divides x and y by z to produce a 2D point', () => {
    const v = createVector3(4, 6, 2);
    const out = { x: 0, y: 0 };
    vec3Project(out, v);
    expect(out.x).toBe(2);
    expect(out.y).toBe(3);
  });

  it('returns the original xy when z is 1', () => {
    const v = createVector3(5, 7, 1);
    const out = { x: 0, y: 0 };
    vec3Project(out, v);
    expect(out.x).toBe(5);
    expect(out.y).toBe(7);
  });
});
