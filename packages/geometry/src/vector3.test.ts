import {
  addVector3,
  angleBetweenVector3,
  cloneVector3,
  copyVector3,
  createVector3,
  crossVector3,
  distanceSquaredVector3,
  distanceVector3,
  dotVector3,
  equalsVector3,
  lengthSquaredVector3,
  lengthVector3,
  nearEqualsVector3,
  negateVector3,
  normalizeVector3,
  projectVector3,
  scaleVector3,
  setVector3,
  subtractVector3,
  VECTOR3_X_AXIS,
  VECTOR3_Y_AXIS,
  VECTOR3_Z_AXIS,
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
    expect(lengthVector3(v)).toBe(5);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(lengthVector3(v)).toBe(5);
  });
});

describe('lengthSquared', () => {
  it('returns the squared length of the vector', () => {
    const v = createVector3(3, 4, 0);
    expect(lengthSquaredVector3(v)).toBe(25);
  });

  it('allows a vector-like object', () => {
    const v = { x: 3, y: 4, z: 0 };
    expect(lengthSquaredVector3(v)).toBe(25);
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

describe('add', () => {
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

describe('clone', () => {
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

describe('copy', () => {
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

describe('cross', () => {
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
});

describe('distance', () => {
  it('returns the distance between two vectors', () => {
    const a = createVector3(1, 1, 1);
    const b = createVector3(4, 5, 6);
    expect(distanceVector3(a, b)).toBeCloseTo(7.071068, 5);
  });
});

describe('distanceSquared', () => {
  it('returns the squared distance between two vectors', () => {
    const a = createVector3(1, 1, 1);
    const b = createVector3(4, 5, 6);
    expect(distanceSquaredVector3(a, b)).toBe(50);
  });
});

describe('dot', () => {
  it('returns the dot product of two vectors', () => {
    const a = createVector3(1, 2, 3);
    const b = createVector3(4, 5, 6);
    expect(dotVector3(a, b)).toBe(32); // 1*4 + 2*5 + 3*6
  });
});

describe('equals', () => {
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

describe('negate', () => {
  it('inverts the values of the vector components', () => {
    const v = createVector3(1, -2, 3);
    const result = createVector3();
    negateVector3(result, v);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(-3);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(1, -2, 3);
    const result = createVector3();
    negateVector3(result, v);
    expect(result.x).toBe(-1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(-3);
  });
});

describe('normalize', () => {
  it('normalizes the vector', () => {
    const v = createVector3(3, 4, 0);
    const result = createVector3();
    const length = normalizeVector3(result, v);
    expect(result.x).toBeCloseTo(0.6, 5);
    expect(result.y).toBeCloseTo(0.8, 5);
    expect(result.z).toBe(0);
    expect(length).toBe(5);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(3, 4, 0);
    const result = createVector3();
    const length = normalizeVector3(result, v);
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
    scaleVector3(result, v, 2);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.z).toBe(2);
  });

  it('modifies target when same object is passed as target', () => {
    const v = createVector3(1, 1, 1);
    const result = createVector3();
    scaleVector3(result, v, 2);
    expect(result.x).toBe(2);
    expect(result.y).toBe(2);
    expect(result.z).toBe(2);
  });
});

describe('setTo', () => {
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

describe('subtract', () => {
  it('returns a new vector when no target is passed', () => {
    const a = createVector3(4, 5, 6);
    const b = createVector3(1, 2, 3);
    const result = createVector3();
    subtractVector3(result, a, b);
    expect(result.x).toBe(3);
    expect(result.y).toBe(3);
    expect(result.z).toBe(3);
  });

  it('modifies target when same object is passed as target', () => {
    const a = createVector3(4, 5, 6);
    const result = createVector3();
    subtractVector3(result, a, a); // passing the same object as both source and target
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });
});

describe('angleBetween', () => {
  it('returns 0 for identical vectors', () => {
    const a = createVector3(1, 0, 0);
    expect(angleBetweenVector3(a, a)).toBeCloseTo(0);
  });

  it('returns PI/2 for perpendicular vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(0, 1, 0);
    expect(angleBetweenVector3(a, b)).toBeCloseTo(Math.PI / 2);
  });

  it('returns PI for opposite vectors', () => {
    const a = createVector3(1, 0, 0);
    const b = createVector3(-1, 0, 0);
    expect(angleBetweenVector3(a, b)).toBeCloseTo(Math.PI);
  });

  it('returns NaN for a zero-length vector', () => {
    const a = createVector3(0, 0, 0);
    const b = createVector3(1, 0, 0);
    expect(angleBetweenVector3(a, b)).toBeNaN();
  });
});

describe('nearEquals', () => {
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

describe('project', () => {
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
});
