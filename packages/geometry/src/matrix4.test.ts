import {
  appendMatrix4,
  appendRotationMatrix4,
  appendScaleMatrix4,
  appendTranslationMatrix4,
  cloneMatrix4,
  composeMatrix4,
  copyMatrix4,
  copyMatrix4ColumnFromVector4,
  copyMatrix4ColumnToVector4,
  copyMatrix4RowFromVector4,
  copyMatrix4RowToVector4,
  createMatrix,
  createMatrix3,
  createMatrix4,
  createMatrix4From2D,
  createOrthographicMatrix4,
  createPerspectiveMatrix4,
  createQuaternion,
  createVector3,
  decomposeMatrix4,
  equalsMatrix4,
  getMatrix4Determinant,
  getMatrix4Element,
  getMatrix4Position,
  interpolateMatrix4,
  inverseMatrix4,
  isAffineMatrix4,
  matrix4TransformPoint,
  matrix4TransformVector,
  matrix4TransformVectors,
  multiplyMatrix4,
  prependMatrix4,
  prependRotationMatrix4,
  prependScaleMatrix4,
  prependTranslationMatrix4,
  rotateMatrix4,
  scaleMatrix4,
  setMatrix4,
  setMatrix4Element,
  setMatrix4From2D,
  setMatrix4FromFloat32Array,
  setMatrix4FromMatrix,
  setMatrix4FromMatrix3,
  setMatrix4FromQuaternion,
  setMatrix4Identity,
  setMatrix4LookAt,
  setMatrix4Position,
  setOrthographicMatrix4,
  setPerspectiveMatrix4,
  setQuaternionFromAxisAngle,
  translateMatrix4,
  transposeMatrix4,
  writeMatrix4ToFloat32Array,
} from '@flighthq/geometry';
import type { Matrix, Matrix4 } from '@flighthq/types';

const X_AXIS = { x: 1, y: 0, z: 0, w: 0 };
const Y_AXIS = { x: 0, y: 1, z: 0, w: 0 };
const Z_AXIS = { x: 0, y: 0, z: 1, w: 0 };

describe('appendMatrix4', () => {
  it('is equivalent to multiply(out, source, other)', () => {
    const a = createMatrix4();
    translateMatrix4(a, a, 5, 0, 0);
    const b = createMatrix4();
    scaleMatrix4(b, b, 2, 2, 2);

    const out1 = createMatrix4();
    appendMatrix4(out1, a, b);

    const out2 = createMatrix4();
    multiplyMatrix4(out2, a, b);

    expect(equalsMatrix4(out1, out2)).toBe(true);
  });

  it('supports out === source', () => {
    const a = createMatrix4();
    translateMatrix4(a, a, 5, 0, 0);
    const b = createMatrix4();
    scaleMatrix4(b, b, 2, 3, 4);
    const expected = createMatrix4();
    appendMatrix4(expected, a, b);

    appendMatrix4(a, a, b);
    expect(equalsMatrix4(a, expected)).toBe(true);
  });
});

describe('appendRotationMatrix4', () => {
  it('rotates identity around Z axis by 90 degrees', () => {
    const m = createMatrix4();

    appendRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    expect(m.m[0]).toBeCloseTo(0);
    expect(m.m[1]).toBeCloseTo(1);
    expect(m.m[4]).toBeCloseTo(-1);
    expect(m.m[5]).toBeCloseTo(0);
  });

  it('does not rotate existing translation when appending rotation', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 10, 0, 0);

    appendRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    expect(m.m[12]).toBe(10);
    expect(m.m[13]).toBe(0);
  });

  it('rotates around pivot point', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 10, 0, 0);

    appendRotationMatrix4(m, m, Math.PI / 2, Z_AXIS, { x: 5, y: 0, z: 0, w: 1 });

    expect(m.m[12]).toBeCloseTo(5);
    expect(m.m[13]).toBeCloseTo(5);
  });

  it('appendRotation and prependRotation match on identity', () => {
    const a = createMatrix4();
    const b = createMatrix4();

    appendRotationMatrix4(a, a, Math.PI / 4, Z_AXIS);
    prependRotationMatrix4(b, b, Math.PI / 4, Z_AXIS);

    expect(equalsMatrix4(a, b)).toBe(true);
  });
});

describe('appendScaleMatrix4', () => {
  it('scales an identity matrix', () => {
    const m = createMatrix4();

    appendScaleMatrix4(m, m, 2, 3, 4);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });

  it('accumulates scale multiplicatively', () => {
    const m = createMatrix4();
    scaleMatrix4(m, m, 2, 2, 2);

    appendScaleMatrix4(m, m, 3, 4, 5);

    expect(m.m[0]).toBe(6);
    expect(m.m[5]).toBe(8);
    expect(m.m[10]).toBe(10);
  });
});

describe('appendTranslationMatrix4', () => {
  it('adds translation to an identity matrix', () => {
    const m = createMatrix4();

    appendTranslationMatrix4(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(1);
    expect(m.m[13]).toBe(2);
    expect(m.m[14]).toBe(3);
  });

  it('adds to existing translation values', () => {
    const m = createMatrix4();
    m.m[12] = 10;
    m.m[13] = 20;
    m.m[14] = 30;

    appendTranslationMatrix4(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(11);
    expect(m.m[13]).toBe(22);
    expect(m.m[14]).toBe(33);
  });

  it('does not affect rotation or scale components', () => {
    const m = createMatrix4();
    m.m[0] = 2; // scale x
    m.m[5] = 3; // scale y
    m.m[10] = 4; // scale z

    appendTranslationMatrix4(m, m, 1, 2, 3);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });
});

describe('cloneMatrix4', () => {
  it('creates a createMatrix4 instance', () => {
    const source = createMatrix4();
    const clone: Matrix4 = cloneMatrix4(source);

    expect(clone).not.toBeNull();
    expect(clone).not.toBe(source);
  });

  it('copies all values from the source matrix', () => {
    const source = createMatrix4(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);

    const clone = cloneMatrix4(source);

    expect(Array.from(clone.m)).toEqual(Array.from(source.m));
  });

  it('does not share internal storage', () => {
    const source = createMatrix4();
    const clone = cloneMatrix4(source);

    clone.m[5] = 42;

    expect(source.m[5]).toBe(1);
    expect(clone.m[5]).toBe(42);
  });
});

describe('composeMatrix4', () => {
  it('composes translation, identity rotation and scale', () => {
    const out = createMatrix4();
    composeMatrix4(out, createVector3(10, 20, 30), createQuaternion(), createVector3(2, 3, 4));

    // Column-major: diagonal carries scale, last column carries translation.
    expect(out.m[0]).toBeCloseTo(2, 6);
    expect(out.m[5]).toBeCloseTo(3, 6);
    expect(out.m[10]).toBeCloseTo(4, 6);
    expect(out.m[12]).toBeCloseTo(10, 6);
    expect(out.m[13]).toBeCloseTo(20, 6);
    expect(out.m[14]).toBeCloseTo(30, 6);
    expect(out.m[15]).toBeCloseTo(1, 6);
  });

  it('round-trips with decomposeMatrix4', () => {
    const position = createVector3(1, -2, 3);
    const rotation = createQuaternion();
    setQuaternionFromAxisAngle(rotation, createVector3(0, 1, 0), Math.PI / 5);
    const scale = createVector3(2, 2, 2);

    const m = createMatrix4();
    composeMatrix4(m, position, rotation, scale);

    const p = createVector3();
    const r = createQuaternion();
    const s = createVector3();
    decomposeMatrix4(p, r, s, m);

    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(-2, 5);
    expect(p.z).toBeCloseTo(3, 5);
    expect(s.x).toBeCloseTo(2, 5);
    expect(s.y).toBeCloseTo(2, 5);
    expect(s.z).toBeCloseTo(2, 5);
    const dot = r.x * rotation.x + r.y * rotation.y + r.z * rotation.z + r.w * rotation.w;
    expect(Math.abs(dot)).toBeCloseTo(1, 5);
  });
});

describe('copyMatrix4', () => {
  it('copies all values from source into out', () => {
    const source = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const out = createMatrix4();
    copyMatrix4(out, source);

    expect(Array.from(out.m)).toEqual(Array.from(source.m));
  });

  it('does not share the underlying Float32Array', () => {
    const source = createMatrix4();
    const out = createMatrix4();

    copyMatrix4(out, source);

    out.m[0] = 99;

    expect(source.m[0]).toBe(1);
    expect(out.m[0]).toBe(99);
  });
});

describe('copyMatrix4ColumnFromVector4', () => {
  it('copies values into column 0', () => {
    const m = createMatrix4();
    const v = { x: 1, y: 2, z: 3, w: 4 };

    copyMatrix4ColumnFromVector4(m, 0, v);

    expect(m.m[0]).toBe(1);
    expect(m.m[1]).toBe(2);
    expect(m.m[2]).toBe(3);
    expect(m.m[3]).toBe(4);
  });

  it('copies values into column 2', () => {
    const m = createMatrix4();
    const v = { x: 5, y: 6, z: 7, w: 8 };

    copyMatrix4ColumnFromVector4(m, 2, v);

    expect(m.m[8]).toBe(5);
    expect(m.m[9]).toBe(6);
    expect(m.m[10]).toBe(7);
    expect(m.m[11]).toBe(8);
  });

  it('throws a RangeError for an invalid column index', () => {
    const m = createMatrix4();
    const v = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => copyMatrix4ColumnFromVector4(m, -1, v)).toThrow(RangeError);
    expect(() => copyMatrix4ColumnFromVector4(m, 4, v)).toThrow(RangeError);
  });
});

describe('copyMatrix4ColumnToVector4', () => {
  it('copies values from column 1 into a vector', () => {
    const m = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const out = { x: 0, y: 0, z: 0, w: 0 };

    copyMatrix4ColumnToVector4(out, 1, m);

    expect(out).toEqual({
      x: 5,
      y: 6,
      z: 7,
      w: 8,
    });
  });

  it('throws a RangeError for an invalid column index', () => {
    const m = createMatrix4();
    const out = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => copyMatrix4ColumnToVector4(out, 99, m)).toThrow(RangeError);
  });
});

describe('copyMatrix4RowFromVector4', () => {
  it('copies values into row 0', () => {
    const m = createMatrix4();
    const v = { x: 1, y: 2, z: 3, w: 4 };

    copyMatrix4RowFromVector4(m, 0, v);

    expect(m.m[0]).toBe(1);
    expect(m.m[4]).toBe(2);
    expect(m.m[8]).toBe(3);
    expect(m.m[12]).toBe(4);
  });

  it('copies values into row 3', () => {
    const m = createMatrix4();
    const v = { x: 9, y: 8, z: 7, w: 6 };

    copyMatrix4RowFromVector4(m, 3, v);

    expect(m.m[3]).toBe(9);
    expect(m.m[7]).toBe(8);
    expect(m.m[11]).toBe(7);
    expect(m.m[15]).toBe(6);
  });

  it('throws a RangeError for an invalid row index', () => {
    const m = createMatrix4();
    const v = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => copyMatrix4RowFromVector4(m, -1, v)).toThrow(RangeError);
    expect(() => copyMatrix4RowFromVector4(m, 4, v)).toThrow(RangeError);
  });
});

describe('copyMatrix4RowToVector4', () => {
  it('copies values from row 2 into a vector', () => {
    const m = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const out = { x: 0, y: 0, z: 0, w: 0 };

    copyMatrix4RowToVector4(out, 2, m);

    expect(out).toEqual({
      x: 3,
      y: 7,
      z: 11,
      w: 15,
    });
  });

  it('throws a RangeError for an invalid row index', () => {
    const m = createMatrix4();
    const out = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => copyMatrix4RowToVector4(out, 42, m)).toThrow(RangeError);
  });
});

describe('createMatrix4', () => {
  it('creates an identity matrix when called with no arguments', () => {
    const m = createMatrix4();

    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('creates a Float32Array of length 16', () => {
    const m = createMatrix4();

    expect(m.m).toBeInstanceOf(Float32Array);
    expect(m.m.length).toBe(16);
  });

  it('overrides only the provided constructor values', () => {
    const m = createMatrix4(
      2, // m00
      undefined,
      undefined,
      undefined,
      undefined,
      3, // m11
    );

    expect(Array.from(m.m)).toEqual([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('maps constructor arguments to correct column-major indices', () => {
    const m = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    expect(Array.from(m.m)).toEqual([
      // column 0
      1, 2, 3, 4,
      // column 1
      5, 6, 7, 8,
      // column 2
      9, 10, 11, 12,
      // column 3
      13, 14, 15, 16,
    ]);
  });
});

describe('createMatrix4From2D', () => {
  it('creates a Matrix4 instance', () => {
    const m: Matrix4 = createMatrix4From2D(1, 0, 0, 1, 10, 20);
    expect(m).not.toBeNull();
  });

  it('initializes the matrix using set2D semantics', () => {
    const m = createMatrix4From2D(1, 2, 3, 4, 5, 6);

    expect(Array.from(m.m)).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1]);
  });

  it('does not share internal storage with other matrices', () => {
    const a = createMatrix4From2D(1, 0, 0, 1, 0, 0);
    const b = createMatrix4From2D(1, 0, 0, 1, 0, 0);

    b.m[0] = 42;

    expect(a.m[0]).toBe(1);
    expect(b.m[0]).toBe(42);
  });
});

describe('createOrthographicMatrix4', () => {
  it('returns a Matrix4 equivalent to setOrtho', () => {
    const m1 = createOrthographicMatrix4(-1, 1, -1, 1, 0.1, 100);
    const m2 = createMatrix4();
    setOrthographicMatrix4(m2, -1, 1, -1, 1, 0.1, 100);
    expect(equalsMatrix4(m1, m2)).toBe(true);
  });
});

describe('createPerspectiveMatrix4', () => {
  it('returns a Matrix4 equivalent to setPerspective', () => {
    const m1 = createPerspectiveMatrix4(0.5, 1.6, 0.1, 1000);
    const m2 = createMatrix4();
    setPerspectiveMatrix4(m2, 0.5, 1.6, 0.1, 1000);
    expect(equalsMatrix4(m1, m2)).toBe(true);
  });
});

describe('decomposeMatrix4', () => {
  it('extracts translation, rotation and scale from a TRS matrix', () => {
    const m = createMatrix4();
    const rotation = createQuaternion();
    setQuaternionFromAxisAngle(rotation, createVector3(0, 0, 1), Math.PI / 2);
    composeMatrix4(m, createVector3(5, 6, 7), rotation, createVector3(2, 3, 4));

    const p = createVector3();
    const r = createQuaternion();
    const s = createVector3();
    decomposeMatrix4(p, r, s, m);

    expect(p.x).toBeCloseTo(5, 5);
    expect(p.y).toBeCloseTo(6, 5);
    expect(p.z).toBeCloseTo(7, 5);
    expect(s.x).toBeCloseTo(2, 5);
    expect(s.y).toBeCloseTo(3, 5);
    expect(s.z).toBeCloseTo(4, 5);
    const dot = r.x * rotation.x + r.y * rotation.y + r.z * rotation.z + r.w * rotation.w;
    expect(Math.abs(dot)).toBeCloseTo(1, 5);
  });

  it('identity matrix decomposes to origin, identity rotation, unit scale', () => {
    const p = createVector3();
    const r = createQuaternion();
    const s = createVector3();
    decomposeMatrix4(p, r, s, createMatrix4());

    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
    expect(s.x).toBeCloseTo(1, 6);
    expect(s.y).toBeCloseTo(1, 6);
    expect(s.z).toBeCloseTo(1, 6);
    expect(r.w).toBeCloseTo(1, 6);
  });
});

describe('equalsMatrix4', () => {
  it('returns true when comparing the same reference', () => {
    const m = createMatrix4();
    expect(equalsMatrix4(m, m)).toBe(true);
  });

  it('returns false if either argument is null or undefined', () => {
    const m = createMatrix4();

    expect(equalsMatrix4(m, null)).toBe(false);
    expect(equalsMatrix4(undefined, m)).toBe(false);
    expect(equalsMatrix4(null, null)).toBe(true); // same reference shortcut
  });

  it('returns true for two matrices with identical values', () => {
    const a = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const b = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    expect(equalsMatrix4(a, b)).toBe(true);
  });

  it('returns false if any value differs', () => {
    const a = createMatrix4();
    const b = createMatrix4();

    b.m[10] = 2;

    expect(equalsMatrix4(a, b)).toBe(false);
  });
});

describe('getMatrix4Determinant', () => {
  it('returns 1 for the identity matrix', () => {
    const m = createMatrix4();
    expect(getMatrix4Determinant(m)).toBe(1);
  });
});

describe('getMatrix4Element', () => {
  it('returns the element at the given row and column', () => {
    const m = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    expect(getMatrix4Element(m, 0, 0)).toBe(1);
    expect(getMatrix4Element(m, 1, 0)).toBe(2);
    expect(getMatrix4Element(m, 0, 1)).toBe(5);
    expect(getMatrix4Element(m, 3, 3)).toBe(16);
  });
});

describe('getMatrix4Position', () => {
  it('extracts translation components from the matrix', () => {
    const m = createMatrix4();
    m.m[12] = 10;
    m.m[13] = 20;
    m.m[14] = 30;

    const out = { x: 0, y: 0, z: 0 };

    getMatrix4Position(out, m);

    expect(out).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('does not mutate the source matrix', () => {
    const m = createMatrix4();
    const snapshot = Array.from(m.m);

    const out = { x: 0, y: 0, z: 0 };
    getMatrix4Position(out, m);

    expect(Array.from(m.m)).toEqual(snapshot);
  });
});

describe('interpolateMatrix4', () => {
  it('returns a at t=0', () => {
    const a = createMatrix4();
    translateMatrix4(a, a, 0, 0, 0);
    const b = createMatrix4();
    translateMatrix4(b, b, 10, 0, 0);
    const out = createMatrix4();
    interpolateMatrix4(out, a, b, 0);
    expect(equalsMatrix4(out, a)).toBe(true);
  });

  it('returns b at t=1', () => {
    const a = createMatrix4();
    const b = createMatrix4();
    translateMatrix4(b, b, 10, 0, 0);
    const out = createMatrix4();
    interpolateMatrix4(out, a, b, 1);
    expect(equalsMatrix4(out, b)).toBe(true);
  });

  it('returns midpoint at t=0.5', () => {
    const a = createMatrix4();
    const b = createMatrix4();
    translateMatrix4(b, b, 10, 0, 0);
    const out = createMatrix4();
    interpolateMatrix4(out, a, b, 0.5);
    expect(out.m[12]).toBeCloseTo(5);
  });

  it('supports out === a', () => {
    const a = createMatrix4();
    const b = createMatrix4();
    translateMatrix4(b, b, 10, 20, 30);
    interpolateMatrix4(a, a, b, 0.5);
    expect(a.m[12]).toBeCloseTo(5);
    expect(a.m[13]).toBeCloseTo(10);
    expect(a.m[14]).toBeCloseTo(15);
  });

  it('supports out === b', () => {
    const a = createMatrix4();
    const b = createMatrix4();
    translateMatrix4(b, b, 10, 20, 30);
    interpolateMatrix4(b, a, b, 0.5);
    expect(b.m[12]).toBeCloseTo(5);
    expect(b.m[13]).toBeCloseTo(10);
    expect(b.m[14]).toBeCloseTo(15);
  });
});

describe('inverseMatrix4', () => {
  it('inverse of identity is identity', () => {
    const m = createMatrix4();
    const inv = createMatrix4();
    inverseMatrix4(inv, m);

    expect(equalsMatrix4(inv, createMatrix4())).toBe(true);
  });

  it('inverse of translation only negates translation', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, -3, 2);

    const inv = createMatrix4();
    inverseMatrix4(inv, m);

    expect(inv.m[12]).toBeCloseTo(-5); // Correct negative translation
    expect(inv.m[13]).toBeCloseTo(3); // Correct negative translation
    expect(inv.m[14]).toBeCloseTo(-2); // Correct negative translation

    // rotation part should stay identity
    expect(inv.m[0]).toBeCloseTo(1);
    expect(inv.m[5]).toBeCloseTo(1);
    expect(inv.m[10]).toBeCloseTo(1);
  });

  it('inverse of rotation-only matrix is its transpose', () => {
    const m = createMatrix4();
    appendRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    const inv = createMatrix4();
    inverseMatrix4(inv, m);

    // m * inv = identity
    const check = createMatrix4();
    multiplyMatrix4(check, m, inv);
    expectMatrix4Close(check, createMatrix4());
  });

  it('inverse of rotation + translation', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 0, 0);
    appendRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    const inv = createMatrix4();
    inverseMatrix4(inv, m);

    // m * inv = identity
    const check = createMatrix4();
    multiplyMatrix4(check, m, inv);
    expectMatrix4Close(check, createMatrix4());
  });

  it('supports out === source', () => {
    const matrix = createMatrix4();
    translateMatrix4(matrix, matrix, 5, -3, 2);
    appendRotationMatrix4(matrix, matrix, Math.PI / 6, Z_AXIS);
    scaleMatrix4(matrix, matrix, 2, 3, 4);
    const expected = createMatrix4();
    inverseMatrix4(expected, matrix);

    inverseMatrix4(matrix, matrix);

    expectMatrix4Close(matrix, expected);
  });

  it('inverse of singular matrix should fail or produce NaN', () => {
    const m = createMatrix4();
    m.m[0] = 0; // make determinant zero

    const inv = createMatrix4();
    const ok = inverseMatrix4(inv, m);

    const det = getMatrix4Determinant(m);
    expect(det).toBeCloseTo(0);

    // Documented sentinel for a singular matrix: returns false and fills the output with NaN.
    expect(ok).toBe(false);
    expect(inv.m[0]).toBeNaN();
    expect(inv.m[1]).toBeNaN();
    expect(inv.m[2]).toBeNaN();
  });

  it('returns false for a singular matrix with out === source', () => {
    const m = createMatrix4();
    m.m[0] = 0; // make determinant zero

    const ok = inverseMatrix4(m, m);

    expect(ok).toBe(false);
    expect(m.m[0]).toBeNaN();
  });
});

describe('isAffineMatrix4', () => {
  it('returns true for the identity matrix', () => {
    const m = createMatrix4();
    expect(isAffineMatrix4(m)).toBe(true);
  });

  it('returns true for a 2D transform matrix', () => {
    const m = createMatrix4From2D(1, 0, 0, 1, 10, 20);
    expect(isAffineMatrix4(m)).toBe(true);
  });

  it('returns false if m[3] is non-zero', () => {
    const m = createMatrix4();
    m.m[3] = 1;
    expect(isAffineMatrix4(m)).toBe(false);
  });

  it('returns false if m[7] is non-zero', () => {
    const m = createMatrix4();
    m.m[7] = 1;
    expect(isAffineMatrix4(m)).toBe(false);
  });

  it('returns false if m[11] is non-zero', () => {
    const m = createMatrix4();
    m.m[11] = 1;
    expect(isAffineMatrix4(m)).toBe(false);
  });

  it('returns false if m[15] is not 1', () => {
    const m = createMatrix4();
    m.m[15] = 0;
    expect(isAffineMatrix4(m)).toBe(false);
  });
});

describe('matrix4TransformPoint', () => {
  it('translates a point by the matrix translation', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 10, 15);
    const out = { x: 0, y: 0, z: 0 };
    matrix4TransformPoint(out, m, { x: 0, y: 0, z: 0 });
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(10);
    expect(out.z).toBeCloseTo(15);
  });

  it('scales a point correctly', () => {
    const m = createMatrix4();
    scaleMatrix4(m, m, 2, 3, 4);
    const out = { x: 0, y: 0, z: 0 };
    matrix4TransformPoint(out, m, { x: 1, y: 2, z: 3 });
    expect(out.x).toBe(2);
    expect(out.y).toBe(6);
    expect(out.z).toBe(12);
  });

  it('supports out === point', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 10, 15);
    const point = { x: 1, y: 2, z: 3 };
    matrix4TransformPoint(point, m, point);
    expect(point.x).toBeCloseTo(6);
    expect(point.y).toBeCloseTo(12);
    expect(point.z).toBeCloseTo(18);
  });
});

describe('matrix4TransformVector', () => {
  it('transforms a Vector4 by the matrix', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 10, 15);
    const out = { x: 0, y: 0, z: 0, w: 0 };
    matrix4TransformVector(out, m, { x: 1, y: 2, z: 3, w: 1 });
    expect(out.x).toBeCloseTo(6);
    expect(out.y).toBeCloseTo(12);
    expect(out.z).toBeCloseTo(18);
  });

  it('does not translate a direction vector with w = 0', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 10, 15);
    const out = { x: 0, y: 0, z: 0, w: 0 };
    matrix4TransformVector(out, m, { x: 1, y: 2, z: 3, w: 0 });
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(2);
    expect(out.z).toBeCloseTo(3);
    expect(out.w).toBeCloseTo(0);
  });

  it('supports out === vector', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 10, 15);
    const vector = { x: 1, y: 2, z: 3, w: 1 };
    matrix4TransformVector(vector, m, vector);
    expect(vector.x).toBeCloseTo(6);
    expect(vector.y).toBeCloseTo(12);
    expect(vector.z).toBeCloseTo(18);
    expect(vector.w).toBeCloseTo(1);
  });
});

describe('matrix4TransformVectors', () => {
  it('transforms a flat array of [x, y, z] triples', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 1, 2, 3);
    const vectors = new Float32Array([0, 0, 0, 1, 0, 0]);
    const out = new Float32Array(6);
    matrix4TransformVectors(out, m, vectors);
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(2);
    expect(out[2]).toBeCloseTo(3);
    expect(out[3]).toBeCloseTo(2);
    expect(out[4]).toBeCloseTo(2);
    expect(out[5]).toBeCloseTo(3);
  });

  it('supports out === vectors', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 1, 2, 3);
    const vectors = new Float32Array([0, 0, 0, 1, 0, 0]);
    matrix4TransformVectors(vectors, m, vectors);
    expect(Array.from(vectors)).toEqual([1, 2, 3, 2, 2, 3]);
  });
});

describe('multiplyMatrix4', () => {
  describe('multiply (identity)', () => {
    it('returns the right-hand operand when left is identity', () => {
      const I = createMatrix4();
      const T = createMatrix4From2D(1, 0, 0, 1, 10, 20);

      const out = createMatrix4();
      multiplyMatrix4(out, I, T);

      expect(equalsMatrix4(out, T)).toBe(true);
    });

    it('returns the left-hand operand when right is identity', () => {
      const I = createMatrix4();
      const S = createMatrix4();
      scaleMatrix4(S, S, 2, 3, 4);

      const out = createMatrix4();
      multiplyMatrix4(out, S, I);

      expect(equalsMatrix4(out, S)).toBe(true);
    });

    it('does not mutate inputs', () => {
      const a = createMatrix4();
      translateMatrix4(a, a, 1, 2, 3);
      const b = createMatrix4();
      scaleMatrix4(b, b, 2, 2, 2);

      const aBefore = Array.from(a.m);
      const bBefore = Array.from(b.m);

      multiplyMatrix4(createMatrix4(), a, b);

      expect(Array.from(a.m)).toEqual(aBefore);
      expect(Array.from(b.m)).toEqual(bBefore);
    });

    it('supports out === a', () => {
      const a = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const b = createMatrix4(17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79);
      const expected = createMatrix4();
      multiplyMatrix4(expected, a, b);

      multiplyMatrix4(a, a, b);
      expect(equalsMatrix4(a, expected)).toBe(true);
    });

    it('supports out === b', () => {
      const a = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const b = createMatrix4(17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79);
      const expected = createMatrix4();
      multiplyMatrix4(expected, a, b);

      multiplyMatrix4(b, a, b);
      expect(equalsMatrix4(b, expected)).toBe(true);
    });
  });

  describe('multiplyMatrix4', () => {
    it('post-multiplies by the given matrix', () => {
      const m = createMatrix4();
      translateMatrix4(m, m, 1, 0, 0);
      const s = createMatrix4();
      scaleMatrix4(s, s, 2, 2, 2);

      multiplyMatrix4(m, m, s);

      // translation then scale: position unaffected
      expect(m.m[12]).toBe(1);
      expect(m.m[0]).toBe(2);
    });
  });

  describe('multiply (ordering)', () => {
    it('translation × scale ≠ scale × translation', () => {
      const T = createMatrix4();
      translateMatrix4(T, T, 10, 0, 0);
      const S = createMatrix4();
      scaleMatrix4(S, S, 2, 2, 2);

      const TS = createMatrix4();
      multiplyMatrix4(TS, T, S);

      const ST = createMatrix4();
      multiplyMatrix4(ST, S, T);

      // TS: translate, then scale → translation unaffected
      expect(TS.m[12]).toBe(10);

      // ST: scale, then translate → translation scaled
      expect(ST.m[12]).toBe(20);

      expect(equalsMatrix4(TS, ST)).toBe(false);
    });
  });

  describe('multiply equivalence', () => {
    it('appendTranslation equals multiply by translation matrix', () => {
      const m1 = createMatrix4();
      translateMatrix4(m1, m1, 1, 2, 3);
      const m2 = createMatrix4();
      translateMatrix4(m2, m2, 1, 2, 3);

      const t = createMatrix4();
      translateMatrix4(t, t, 4, 5, 6);

      appendTranslationMatrix4(m1, m1, 4, 5, 6);
      multiplyMatrix4(m2, m2, t);

      expect(equalsMatrix4(m1, m2)).toBe(true);
    });

    it('prependScale equals multiply scale × matrix', () => {
      const m1 = createMatrix4();
      translateMatrix4(m1, m1, 10, 0, 0);
      const m2 = createMatrix4();
      translateMatrix4(m2, m2, 10, 0, 0);

      const s = createMatrix4();
      scaleMatrix4(s, s, 2, 2, 2);

      prependScaleMatrix4(m1, m1, 2, 2, 2);
      multiplyMatrix4(m2, s, m2);

      expect(equalsMatrix4(m1, m2)).toBe(true);
    });
  });
});

describe('prependMatrix4', () => {
  it('is equivalent to multiply(out, other, source)', () => {
    const a = createMatrix4();
    translateMatrix4(a, a, 5, 0, 0);
    const b = createMatrix4();
    scaleMatrix4(b, b, 2, 2, 2);

    const out1 = createMatrix4();
    prependMatrix4(out1, a, b);

    const out2 = createMatrix4();
    multiplyMatrix4(out2, b, a);

    expect(equalsMatrix4(out1, out2)).toBe(true);
  });

  it('supports out === source', () => {
    const a = createMatrix4();
    translateMatrix4(a, a, 5, 0, 0);
    const b = createMatrix4();
    scaleMatrix4(b, b, 2, 3, 4);
    const expected = createMatrix4();
    prependMatrix4(expected, a, b);

    prependMatrix4(a, a, b);
    expect(equalsMatrix4(a, expected)).toBe(true);
  });
});

describe('prependRotationMatrix4', () => {
  it('rotates identity around Z axis', () => {
    const m = createMatrix4();

    prependRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    expect(m.m[0]).toBeCloseTo(0);
    expect(m.m[1]).toBeCloseTo(1);
  });

  it('rotates translation when prepending rotation', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 10, 0, 0);

    prependRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    // (10, 0, 0) → (0, 10, 0)
    expect(m.m[12]).toBeCloseTo(0);
    expect(m.m[13]).toBeCloseTo(10);
  });
});

describe('prependScaleMatrix4', () => {
  it('scales an identity matrix', () => {
    const m = createMatrix4();

    prependScaleMatrix4(m, m, 2, 3, 4);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });

  it('scales translation when prepending scale', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 10, 20, 30);

    prependScaleMatrix4(m, m, 2, 3, 4);

    expect(m.m[12]).toBe(20); // 10 * 2
    expect(m.m[13]).toBe(60); // 20 * 3
    expect(m.m[14]).toBe(120); // 30 * 4
  });

  it('scale, appendScale, and prependScale behave the same on identity', () => {
    const a = createMatrix4();
    const b = createMatrix4();
    const c = createMatrix4();

    scaleMatrix4(a, a, 2, 3, 4);
    appendScaleMatrix4(b, b, 2, 3, 4);
    prependScaleMatrix4(c, c, 2, 3, 4);

    expect(equalsMatrix4(a, b)).toBe(true);
    expect(equalsMatrix4(b, c)).toBe(true);
  });
});

describe('prependTranslationMatrix4', () => {
  it('translates an identity matrix by (x, y, z)', () => {
    const m = createMatrix4();

    prependTranslationMatrix4(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(1);
    expect(m.m[13]).toBe(2);
    expect(m.m[14]).toBe(3);
  });

  it('prepends translation before existing transforms', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 10, 0, 0);

    prependTranslationMatrix4(m, m, 5, 0, 0);

    // world-space prepend: (5 + 10)
    expect(m.m[12]).toBe(15);
  });

  it('translate, appendTranslation, and prependTranslation behave the same on identity', () => {
    const a = createMatrix4();
    const b = createMatrix4();
    const c = createMatrix4();

    translateMatrix4(a, a, 1, 2, 3);
    appendTranslationMatrix4(b, b, 1, 2, 3);
    prependTranslationMatrix4(c, c, 1, 2, 3);

    expect(equalsMatrix4(a, b)).toBe(true);
    expect(equalsMatrix4(b, c)).toBe(true);
  });
});

describe('rotateMatrix4', () => {
  it('matches appendRotation on identity', () => {
    const a = createMatrix4();
    const b = createMatrix4();

    rotateMatrix4(a, a, Z_AXIS, Math.PI / 2);
    appendRotationMatrix4(b, b, Math.PI / 2, Z_AXIS);

    expect(equalsMatrix4(a, b)).toBe(true);
  });

  it('preserves translation when rotating locally', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 5, 0, 0);

    rotateMatrix4(m, m, Z_AXIS, Math.PI / 2);

    expect(m.m[12]).toBe(5);
    expect(m.m[13]).toBe(0);
  });

  it('rotation around X does not affect X axis basis vector', () => {
    const m = createMatrix4();

    appendRotationMatrix4(m, m, Math.PI / 2, X_AXIS);

    expect(m.m[0]).toBeCloseTo(1);
    expect(m.m[1]).toBeCloseTo(0);
    expect(m.m[2]).toBeCloseTo(0);
  });

  it('rotation around Y does not affect Y axis basis vector', () => {
    const m = createMatrix4();

    appendRotationMatrix4(m, m, Math.PI / 2, Y_AXIS);

    expect(m.m[4]).toBeCloseTo(0);
    expect(m.m[5]).toBeCloseTo(1);
    expect(m.m[6]).toBeCloseTo(0);
  });
});

describe('scaleMatrix4', () => {
  it('scales an identity matrix by (x, y, z)', () => {
    const m = createMatrix4();

    scaleMatrix4(m, m, 2, 3, 4);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });

  it('accumulates scale multiplicatively', () => {
    const m = createMatrix4();

    scaleMatrix4(m, m, 2, 3, 4);
    scaleMatrix4(m, m, 5, 6, 7);

    expect(m.m[0]).toBe(10); // 2 * 5
    expect(m.m[5]).toBe(18); // 3 * 6
    expect(m.m[10]).toBe(28); // 4 * 7
  });

  it('does not modify translation when scaling locally', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 10, 20, 30);

    scaleMatrix4(m, m, 2, 3, 4);

    expect(m.m[12]).toBe(10);
    expect(m.m[13]).toBe(20);
    expect(m.m[14]).toBe(30);
  });
});

describe('setMatrix4', () => {
  it('sets all 16 values in column-major order', () => {
    const m = createMatrix4();

    setMatrix4(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    expect(Array.from(m.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('overwrites existing matrix values completely', () => {
    const m = createMatrix4(99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99);

    setMatrix4(m, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('setMatrix4Element', () => {
  it('writes the value at the given row and column', () => {
    const m = createMatrix4();
    setMatrix4Element(m, 2, 3, 42);
    expect(getMatrix4Element(m, 2, 3)).toBe(42);
  });

  it('does not affect other elements', () => {
    const m = createMatrix4();
    setMatrix4Element(m, 1, 2, 7);
    expect(getMatrix4Element(m, 0, 0)).toBe(1);
    expect(getMatrix4Element(m, 3, 3)).toBe(1);
  });
});

describe('setMatrix4From2D', () => {
  it('sets a 2D transform with translation', () => {
    const m = createMatrix4();

    setMatrix4From2D(m, 1, 2, 3, 4, 5, 6);

    expect(Array.from(m.m)).toEqual([
      // column 0
      1, 2, 0, 0,
      // column 1
      3, 4, 0, 0,
      // column 2
      0, 0, 1, 0,
      // column 3
      5, 6, 0, 1,
    ]);
  });

  it('defaults tx and ty to 0 when omitted', () => {
    const m = createMatrix4();

    setMatrix4From2D(m, 7, 8, 9, 10);

    expect(m.m[12]).toBe(0);
    expect(m.m[13]).toBe(0);
  });

  it('produces an affine matrix', () => {
    const m = createMatrix4();

    setMatrix4From2D(m, 1, 0, 0, 1, 0, 0);

    expect(isAffineMatrix4(m)).toBe(true);
  });

  it('sets Z axis to identity', () => {
    const m = createMatrix4();

    setMatrix4From2D(m, 1, 2, 3, 4);

    expect(m.m[10]).toBe(1); // z-scale
    expect(m.m[2]).toBe(0);
    expect(m.m[6]).toBe(0);
    expect(m.m[14]).toBe(0);
  });
});

describe('setMatrix4FromFloat32Array', () => {
  it('reads 16 elements at offset 0', () => {
    const arr = new Float32Array(16);
    for (let i = 0; i < 16; i++) arr[i] = i + 1;
    const m = createMatrix4();
    setMatrix4FromFloat32Array(m, 0, arr);
    for (let i = 0; i < 16; i++) {
      expect(m.m[i]).toBe(i + 1);
    }
  });

  it('reads 16 elements at a non-zero offset', () => {
    const arr = new Float32Array(20);
    for (let i = 0; i < 20; i++) arr[i] = i + 1;
    const m = createMatrix4();
    setMatrix4FromFloat32Array(m, 4, arr);
    for (let i = 0; i < 16; i++) {
      expect(m.m[i]).toBe(i + 5);
    }
  });

  it('round-trips with writeMatrix4ToFloat32Array', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 3, 4, 5);
    const arr = new Float32Array(16);
    writeMatrix4ToFloat32Array(arr, 0, m);
    const m2 = createMatrix4();
    setMatrix4FromFloat32Array(m2, 0, arr);
    expect(equalsMatrix4(m, m2)).toBe(true);
  });
});

describe('setMatrix4FromMatrix', () => {
  it('should convert an Matrix to a Matrix4', () => {
    const mat2D: Matrix = createMatrix();

    const mat = createMatrix4();
    setMatrix4FromMatrix(mat, mat2D);

    const expectedMatrix4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix4);
  });

  it('should handle scaling and translation', () => {
    // scale(2,3), translate(5,10)
    const mat2D: Matrix = createMatrix(2, 0, 0, 3, 5, 10);

    const mat = createMatrix4();
    setMatrix4FromMatrix(mat, mat2D);

    expect(getMatrix4Element(mat, 0, 0)).toEqual(2); // a
    expect(getMatrix4Element(mat, 0, 1)).toEqual(0); // b
    expect(getMatrix4Element(mat, 0, 2)).toEqual(0);
    expect(getMatrix4Element(mat, 0, 3)).toEqual(5); // tx

    expect(getMatrix4Element(mat, 1, 0)).toEqual(0); // c
    expect(getMatrix4Element(mat, 1, 1)).toEqual(3); // d
    expect(getMatrix4Element(mat, 1, 2)).toEqual(0);
    expect(getMatrix4Element(mat, 1, 3)).toEqual(10); // ty

    expect(getMatrix4Element(mat, 2, 0)).toEqual(0);
    expect(getMatrix4Element(mat, 2, 1)).toEqual(0);
    expect(getMatrix4Element(mat, 2, 2)).toEqual(1);
    expect(getMatrix4Element(mat, 2, 3)).toEqual(0);

    expect(getMatrix4Element(mat, 3, 0)).toEqual(0);
    expect(getMatrix4Element(mat, 3, 1)).toEqual(0);
    expect(getMatrix4Element(mat, 3, 2)).toEqual(0);
    expect(getMatrix4Element(mat, 3, 3)).toEqual(1);
  });
});

describe('setMatrix4FromMatrix3', () => {
  it('should convert a Matrix3x3 to a Matrix4', () => {
    const mat3 = createMatrix3();

    const mat = createMatrix4();
    setMatrix4FromMatrix3(mat, mat3);

    const expectedMatrix4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix4);
  });

  it('should handle scaling and translation', () => {
    // scale(2,3), translate(5,10)
    const mat3 = createMatrix3(2, 0, 5, 0, 3, 10, 0, 0, 1);

    const mat = createMatrix4();
    setMatrix4FromMatrix3(mat, mat3);

    expect(getMatrix4Element(mat, 0, 0)).toEqual(2); // a
    expect(getMatrix4Element(mat, 0, 1)).toEqual(0); // b
    expect(getMatrix4Element(mat, 0, 2)).toEqual(0);
    expect(getMatrix4Element(mat, 0, 3)).toEqual(5); // tx

    expect(getMatrix4Element(mat, 1, 0)).toEqual(0); // c
    expect(getMatrix4Element(mat, 1, 1)).toEqual(3); // d
    expect(getMatrix4Element(mat, 1, 2)).toEqual(0);
    expect(getMatrix4Element(mat, 1, 3)).toEqual(10); // ty

    expect(getMatrix4Element(mat, 2, 0)).toEqual(0);
    expect(getMatrix4Element(mat, 2, 1)).toEqual(0);
    expect(getMatrix4Element(mat, 2, 2)).toEqual(1);
    expect(getMatrix4Element(mat, 2, 3)).toEqual(0);

    expect(getMatrix4Element(mat, 3, 0)).toEqual(0);
    expect(getMatrix4Element(mat, 3, 1)).toEqual(0);
    expect(getMatrix4Element(mat, 3, 2)).toEqual(0);
    expect(getMatrix4Element(mat, 3, 3)).toEqual(1);
  });
});

describe('setMatrix4FromQuaternion', () => {
  it('identity quaternion writes the identity matrix', () => {
    const m = createMatrix4(2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2);
    setMatrix4FromQuaternion(m, createQuaternion());
    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('a 90-degree z rotation maps +x to +y', () => {
    const q = createQuaternion();
    setQuaternionFromAxisAngle(q, createVector3(0, 0, 1), Math.PI / 2);
    const m = createMatrix4();
    setMatrix4FromQuaternion(m, q);
    const out = createVector3();
    matrix4TransformPoint(out, m, createVector3(1, 0, 0));
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });
});

describe('setMatrix4Identity', () => {
  it('resets a matrix to identity', () => {
    const m = createMatrix4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    setMatrix4Identity(m);

    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('setMatrix4LookAt', () => {
  it('places the eye at the origin of view space', () => {
    const m = createMatrix4();
    const eye = createVector3(0, 0, 5);
    setMatrix4LookAt(m, eye, createVector3(0, 0, 0), createVector3(0, 1, 0));

    const out = createVector3();
    matrix4TransformPoint(out, m, eye);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('looks down -z so the target lands in front of the camera', () => {
    const m = createMatrix4();
    setMatrix4LookAt(m, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));

    const out = createVector3();
    matrix4TransformPoint(out, m, createVector3(0, 0, 0));
    // Target is 5 units in front of the eye => view-space z = -5 (RH).
    expect(out.z).toBeCloseTo(-5, 6);
  });
});

describe('setMatrix4Position', () => {
  it('sets the translation components of the matrix', () => {
    const m = createMatrix4();

    setMatrix4Position(m, { x: 5, y: 6, z: 7 });

    expect(m.m[12]).toBe(5);
    expect(m.m[13]).toBe(6);
    expect(m.m[14]).toBe(7);
  });

  it('does not modify other matrix values', () => {
    const m = createMatrix4();
    const before = Array.from(m.m);

    setMatrix4Position(m, { x: 1, y: 2, z: 3 });

    expect(m.m[0]).toBe(before[0]);
    expect(m.m[5]).toBe(before[5]);
    expect(m.m[10]).toBe(before[10]);
    expect(m.m[15]).toBe(before[15]);
  });

  it('can overwrite an existing translation', () => {
    const m = createMatrix4();
    setMatrix4Position(m, { x: 1, y: 2, z: 3 });
    setMatrix4Position(m, { x: -1, y: -2, z: -3 });

    expect(m.m[12]).toBe(-1);
    expect(m.m[13]).toBe(-2);
    expect(m.m[14]).toBe(-3);
  });
});

describe('setOrthographicMatrix4', () => {
  it('sets m[0] to 2 / (right - left)', () => {
    const m = createMatrix4();
    setOrthographicMatrix4(m, -1, 1, -1, 1, 0.1, 100);
    expect(m.m[0]).toBeCloseTo(1); // 2 / (1 - (-1)) = 1
  });

  it('sets m[5] to 2 / (top - bottom)', () => {
    const m = createMatrix4();
    setOrthographicMatrix4(m, 0, 2, 0, 4, 0.1, 100);
    expect(m.m[5]).toBeCloseTo(0.5); // 2 / (4 - 0) = 0.5
  });
});

describe('setPerspectiveMatrix4', () => {
  it('throws when aspect is 0', () => {
    const m = createMatrix4();
    expect(() => setPerspectiveMatrix4(m, 0.5, 0, 0.1, 1000)).toThrow();
  });

  it('sets m[11] to -1', () => {
    const m = createMatrix4();
    setPerspectiveMatrix4(m, 0.5, 1.6, 0.1, 1000);
    expect(m.m[11]).toBe(-1);
  });

  it('sets m[15] to 0 so clip w is -z, not -z + w', () => {
    const m = createMatrix4();
    setPerspectiveMatrix4(m, 0.5, 1.6, 0.1, 1000);
    expect(m.m[15]).toBe(0);
  });

  it('projects a point to clip w = -z_eye (the perspective divisor)', () => {
    const m = createMatrix4();
    setPerspectiveMatrix4(m, 0.5, 1.6, 0.1, 1000);
    // w_clip for a point (x, y, z, 1) is row 3 of the matrix: m[3]*x + m[7]*y + m[11]*z + m[15]*1.
    // With m[3]=m[7]=0, m[11]=-1, m[15]=0, a point 5 units in front of the camera (z_eye = -5) must
    // divide by +5. A stray m[15]=1 would give 6, shrinking the projection.
    const zEye = -5;
    const wClip = m.m[3] * 2 + m.m[7] * 3 + m.m[11] * zEye + m.m[15] * 1;
    expect(wClip).toBe(5);
  });
});

describe('translateMatrix4', () => {
  it('translates an identity matrix by (x, y, z)', () => {
    const m = createMatrix4();

    translateMatrix4(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(1);
    expect(m.m[13]).toBe(2);
    expect(m.m[14]).toBe(3);
  });

  it('accumulates translation when called multiple times', () => {
    const m = createMatrix4();

    translateMatrix4(m, m, 1, 2, 3);
    translateMatrix4(m, m, 4, 5, 6);

    expect(m.m[12]).toBe(5);
    expect(m.m[13]).toBe(7);
    expect(m.m[14]).toBe(9);
  });
});

describe('transposeMatrix4', () => {
  it('transpose of identity is identity', () => {
    const m = createMatrix4();
    const t = createMatrix4();
    transposeMatrix4(t, m);
    expect(equalsMatrix4(t, m)).toBe(true);
  });

  it('transpose of diagonal matrix is itself', () => {
    const m = createMatrix4();
    scaleMatrix4(m, m, 2, 3, 4); // diagonal elements only
    const t = createMatrix4();
    transposeMatrix4(t, m);
    expect(equalsMatrix4(t, m)).toBe(true);
  });

  it('transpose of rotation matrix equals its inverse', () => {
    const m = createMatrix4();
    appendRotationMatrix4(m, m, Math.PI / 2, Z_AXIS);

    const t = createMatrix4();
    transposeMatrix4(t, m);
    const inv = createMatrix4();
    inverseMatrix4(inv, m);

    // element-wise close comparison
    for (let i = 0; i < 16; i++) {
      expect(t.m[i]).toBeCloseTo(inv.m[i]);
    }
  });

  it('transpose of arbitrary matrix swaps rows and columns', () => {
    const m = createMatrix4();
    setMatrix4(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const t = createMatrix4();
    transposeMatrix4(t, m);
    const values = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16];
    for (let i = 0; i < values.length; i++) {
      expect(t.m[i]).toBe(values[i]);
    }
  });

  it('transpose twice returns original matrix', () => {
    const m = createMatrix4();
    setMatrix4(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const t = createMatrix4();
    transposeMatrix4(t, m);
    const t2 = createMatrix4();
    transposeMatrix4(t2, t);
    expect(equalsMatrix4(t2, m)).toBe(true);
  });

  it('supports out === source', () => {
    const matrix = createMatrix4();
    setMatrix4(matrix, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const expected = createMatrix4();
    transposeMatrix4(expected, matrix);

    transposeMatrix4(matrix, matrix);
    expect(equalsMatrix4(matrix, expected)).toBe(true);
  });
});

describe('writeMatrix4ToFloat32Array', () => {
  it('writes 16 elements at offset 0', () => {
    const m = createMatrix4();
    setMatrix4(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const arr = new Float32Array(16);
    writeMatrix4ToFloat32Array(arr, 0, m);
    for (let i = 0; i < 16; i++) {
      expect(arr[i]).toBe(m.m[i]);
    }
  });

  it('writes 16 elements at a non-zero offset', () => {
    const m = createMatrix4();
    translateMatrix4(m, m, 1, 2, 3);
    const arr = new Float32Array(20);
    writeMatrix4ToFloat32Array(arr, 4, m);
    for (let i = 0; i < 16; i++) {
      expect(arr[4 + i]).toBe(m.m[i]);
    }
    // Bytes before offset untouched
    expect(arr[0]).toBe(0);
    expect(arr[3]).toBe(0);
  });
});

function expectMatrix4Close(actual: Matrix4, expected: Matrix4): void {
  for (let i = 0; i < 16; i++) {
    expect(actual.m[i]).toBeCloseTo(expected.m[i]);
  }
}
