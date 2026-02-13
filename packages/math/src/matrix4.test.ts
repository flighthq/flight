import type { Matrix2D, Matrix4 } from '@flighthq/types';

import * as matrix2D from './matrix2D.js';
import * as matrix3 from './matrix3.js';
import * as matrix4 from './matrix4.js';

const X_AXIS = { x: 1, y: 0, z: 0, w: 0 };
const Y_AXIS = { x: 0, y: 1, z: 0, w: 0 };
const Z_AXIS = { x: 0, y: 0, z: 1, w: 0 };

describe('create', () => {
  it('creates an identity matrix when called with no arguments', () => {
    const m = matrix4.create();

    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('creates a Float32Array of length 16', () => {
    const m = matrix4.create();

    expect(m.m).toBeInstanceOf(Float32Array);
    expect(m.m.length).toBe(16);
  });

  it('overrides only the provided constructor values', () => {
    const m = matrix4.create(
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
    const m = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

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

describe('appendRotation', () => {
  it('rotates identity around Z axis by 90 degrees', () => {
    const m = matrix4.create();

    matrix4.appendRotation(m, m, 90, Z_AXIS);

    expect(m.m[0]).toBeCloseTo(0);
    expect(m.m[1]).toBeCloseTo(1);
    expect(m.m[4]).toBeCloseTo(-1);
    expect(m.m[5]).toBeCloseTo(0);
  });

  it('does not rotate existing translation when appending rotation', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 10, 0, 0);

    matrix4.appendRotation(m, m, 90, Z_AXIS);

    expect(m.m[12]).toBe(10);
    expect(m.m[13]).toBe(0);
  });

  it('rotates around pivot point', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 10, 0, 0);

    matrix4.appendRotation(m, m, 90, Z_AXIS, { x: 5, y: 0, z: 0, w: 1 });

    expect(m.m[12]).toBeCloseTo(5);
    expect(m.m[13]).toBeCloseTo(5);
  });

  it('appendRotation and prependRotation match on identity', () => {
    const a = matrix4.create();
    const b = matrix4.create();

    matrix4.appendRotation(a, a, 45, Z_AXIS);
    matrix4.prependRotation(b, b, 45, Z_AXIS);

    expect(matrix4.equals(a, b)).toBe(true);
  });
});

describe('appendScale', () => {
  it('scales an identity matrix', () => {
    const m = matrix4.create();

    matrix4.appendScale(m, m, 2, 3, 4);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });

  it('accumulates scale multiplicatively', () => {
    const m = matrix4.create();
    matrix4.scale(m, m, 2, 2, 2);

    matrix4.appendScale(m, m, 3, 4, 5);

    expect(m.m[0]).toBe(6);
    expect(m.m[5]).toBe(8);
    expect(m.m[10]).toBe(10);
  });
});

describe('appendTranslation', () => {
  it('adds translation to an identity matrix', () => {
    const m = matrix4.create();

    matrix4.appendTranslation(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(1);
    expect(m.m[13]).toBe(2);
    expect(m.m[14]).toBe(3);
  });

  it('adds to existing translation values', () => {
    const m = matrix4.create();
    m.m[12] = 10;
    m.m[13] = 20;
    m.m[14] = 30;

    matrix4.appendTranslation(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(11);
    expect(m.m[13]).toBe(22);
    expect(m.m[14]).toBe(33);
  });

  it('does not affect rotation or scale components', () => {
    const m = matrix4.create();
    m.m[0] = 2; // scale x
    m.m[5] = 3; // scale y
    m.m[10] = 4; // scale z

    matrix4.appendTranslation(m, m, 1, 2, 3);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });
});

describe('clone', () => {
  it('creates a matrix4.create instance', () => {
    const source = matrix4.create();
    const clone: Matrix4 = matrix4.clone(source);

    expect(clone).not.toBeNull();
    expect(clone).not.toBe(source);
  });

  it('copies all values from the source matrix', () => {
    const source = matrix4.create(2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53);

    const clone = matrix4.clone(source);

    expect(Array.from(clone.m)).toEqual(Array.from(source.m));
  });

  it('does not share internal storage', () => {
    const source = matrix4.create();
    const clone = matrix4.clone(source);

    clone.m[5] = 42;

    expect(source.m[5]).toBe(1);
    expect(clone.m[5]).toBe(42);
  });
});

describe('copy', () => {
  it('copies all values from source into out', () => {
    const source = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const out = matrix4.create();
    matrix4.copy(out, source);

    expect(Array.from(out.m)).toEqual(Array.from(source.m));
  });

  it('does not share the underlying Float32Array', () => {
    const source = matrix4.create();
    const out = matrix4.create();

    matrix4.copy(out, source);

    out.m[0] = 99;

    expect(source.m[0]).toBe(1);
    expect(out.m[0]).toBe(99);
  });
});

describe('copyColumnFrom', () => {
  it('copies values into column 0', () => {
    const m = matrix4.create();
    const v = { x: 1, y: 2, z: 3, w: 4 };

    matrix4.copyColumnFrom(m, 0, v);

    expect(m.m[0]).toBe(1);
    expect(m.m[1]).toBe(2);
    expect(m.m[2]).toBe(3);
    expect(m.m[3]).toBe(4);
  });

  it('copies values into column 2', () => {
    const m = matrix4.create();
    const v = { x: 5, y: 6, z: 7, w: 8 };

    matrix4.copyColumnFrom(m, 2, v);

    expect(m.m[8]).toBe(5);
    expect(m.m[9]).toBe(6);
    expect(m.m[10]).toBe(7);
    expect(m.m[11]).toBe(8);
  });

  it('throws a RangeError for an invalid column index', () => {
    const m = matrix4.create();
    const v = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => matrix4.copyColumnFrom(m, -1, v)).toThrow(RangeError);
    expect(() => matrix4.copyColumnFrom(m, 4, v)).toThrow(RangeError);
  });
});

describe('copyColumnTo', () => {
  it('copies values from column 1 into a vector', () => {
    const m = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const out = { x: 0, y: 0, z: 0, w: 0 };

    matrix4.copyColumnTo(out, 1, m);

    expect(out).toEqual({
      x: 5,
      y: 6,
      z: 7,
      w: 8,
    });
  });

  it('throws a RangeError for an invalid column index', () => {
    const m = matrix4.create();
    const out = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => matrix4.copyColumnTo(out, 99, m)).toThrow(RangeError);
  });
});

describe('copyRowFrom', () => {
  it('copies values into row 0', () => {
    const m = matrix4.create();
    const v = { x: 1, y: 2, z: 3, w: 4 };

    matrix4.copyRowFrom(m, 0, v);

    expect(m.m[0]).toBe(1);
    expect(m.m[4]).toBe(2);
    expect(m.m[8]).toBe(3);
    expect(m.m[12]).toBe(4);
  });

  it('copies values into row 3', () => {
    const m = matrix4.create();
    const v = { x: 9, y: 8, z: 7, w: 6 };

    matrix4.copyRowFrom(m, 3, v);

    expect(m.m[3]).toBe(9);
    expect(m.m[7]).toBe(8);
    expect(m.m[11]).toBe(7);
    expect(m.m[15]).toBe(6);
  });

  it('throws a RangeError for an invalid row index', () => {
    const m = matrix4.create();
    const v = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => matrix4.copyRowFrom(m, -1, v)).toThrow(RangeError);
    expect(() => matrix4.copyRowFrom(m, 4, v)).toThrow(RangeError);
  });
});

describe('copyRowTo', () => {
  it('copies values from row 2 into a vector', () => {
    const m = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const out = { x: 0, y: 0, z: 0, w: 0 };

    matrix4.copyRowTo(out, 2, m);

    expect(out).toEqual({
      x: 3,
      y: 7,
      z: 11,
      w: 15,
    });
  });

  it('throws a RangeError for an invalid row index', () => {
    const m = matrix4.create();
    const out = { x: 0, y: 0, z: 0, w: 0 };

    expect(() => matrix4.copyRowTo(out, 42, m)).toThrow(RangeError);
  });
});

describe('create2D', () => {
  it('creates a matrix4 instance', () => {
    const m: Matrix4 = matrix4.create2D(1, 0, 0, 1, 10, 20);
    expect(m).not.toBeNull();
  });

  it('initializes the matrix using set2D semantics', () => {
    const m = matrix4.create2D(1, 2, 3, 4, 5, 6);

    expect(Array.from(m.m)).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1]);
  });

  it('does not share internal storage with other matrices', () => {
    const a = matrix4.create2D(1, 0, 0, 1, 0, 0);
    const b = matrix4.create2D(1, 0, 0, 1, 0, 0);

    b.m[0] = 42;

    expect(a.m[0]).toBe(1);
    expect(b.m[0]).toBe(42);
  });
});

describe('determinant', () => {
  it('returns 1 for the identity matrix', () => {
    const m = matrix4.create();
    expect(matrix4.determinant(m)).toBe(1);
  });
});

describe('equals', () => {
  it('returns true when comparing the same reference', () => {
    const m = matrix4.create();
    expect(matrix4.equals(m, m)).toBe(true);
  });

  it('returns false if either argument is null or undefined', () => {
    const m = matrix4.create();

    expect(matrix4.equals(m, null)).toBe(false);
    expect(matrix4.equals(undefined, m)).toBe(false);
    expect(matrix4.equals(null, null)).toBe(true); // same reference shortcut
  });

  it('returns true for two matrices with identical values', () => {
    const a = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    const b = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    expect(matrix4.equals(a, b)).toBe(true);
  });

  it('returns false if any value differs', () => {
    const a = matrix4.create();
    const b = matrix4.create();

    b.m[10] = 2;

    expect(matrix4.equals(a, b)).toBe(false);
  });
});

describe('fromMatrix2D', () => {
  it('should convert an Matrix2D to a Matrix4', () => {
    const mat2D: Matrix2D = matrix2D.create();

    const mat = matrix4.create();
    matrix4.fromMatrix2D(mat, mat2D);

    const expectedMatrix4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix4);
  });

  it('should handle scaling and translation', () => {
    // scale(2,3), translate(5,10)
    const mat2D: Matrix2D = matrix2D.create(2, 0, 0, 3, 5, 10);

    const mat = matrix4.create();
    matrix4.fromMatrix2D(mat, mat2D);

    expect(matrix4.get(mat, 0, 0)).toEqual(2); // a
    expect(matrix4.get(mat, 0, 1)).toEqual(0); // b
    expect(matrix4.get(mat, 0, 2)).toEqual(0);
    expect(matrix4.get(mat, 0, 3)).toEqual(5); // tx

    expect(matrix4.get(mat, 1, 0)).toEqual(0); // c
    expect(matrix4.get(mat, 1, 1)).toEqual(3); // d
    expect(matrix4.get(mat, 1, 2)).toEqual(0);
    expect(matrix4.get(mat, 1, 3)).toEqual(10); // ty

    expect(matrix4.get(mat, 2, 0)).toEqual(0);
    expect(matrix4.get(mat, 2, 1)).toEqual(0);
    expect(matrix4.get(mat, 2, 2)).toEqual(1);
    expect(matrix4.get(mat, 2, 3)).toEqual(0);

    expect(matrix4.get(mat, 3, 0)).toEqual(0);
    expect(matrix4.get(mat, 3, 1)).toEqual(0);
    expect(matrix4.get(mat, 3, 2)).toEqual(0);
    expect(matrix4.get(mat, 3, 3)).toEqual(1);
  });
});

describe('fromMatrix3', () => {
  it('should convert a Matrix3 to a Matrix4', () => {
    const mat3 = matrix3.create();

    const mat = matrix4.create();
    matrix4.fromMatrix3(mat, mat3);

    const expectedMatrix4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix4);
  });

  it('should handle scaling and translation', () => {
    // scale(2,3), translate(5,10)
    const mat3 = matrix3.create(2, 0, 5, 0, 3, 10, 0, 0, 1);

    const mat = matrix4.create();
    matrix4.fromMatrix3(mat, mat3);

    expect(matrix4.get(mat, 0, 0)).toEqual(2); // a
    expect(matrix4.get(mat, 0, 1)).toEqual(0); // b
    expect(matrix4.get(mat, 0, 2)).toEqual(0);
    expect(matrix4.get(mat, 0, 3)).toEqual(5); // tx

    expect(matrix4.get(mat, 1, 0)).toEqual(0); // c
    expect(matrix4.get(mat, 1, 1)).toEqual(3); // d
    expect(matrix4.get(mat, 1, 2)).toEqual(0);
    expect(matrix4.get(mat, 1, 3)).toEqual(10); // ty

    expect(matrix4.get(mat, 2, 0)).toEqual(0);
    expect(matrix4.get(mat, 2, 1)).toEqual(0);
    expect(matrix4.get(mat, 2, 2)).toEqual(1);
    expect(matrix4.get(mat, 2, 3)).toEqual(0);

    expect(matrix4.get(mat, 3, 0)).toEqual(0);
    expect(matrix4.get(mat, 3, 1)).toEqual(0);
    expect(matrix4.get(mat, 3, 2)).toEqual(0);
    expect(matrix4.get(mat, 3, 3)).toEqual(1);
  });
});

describe('identity', () => {
  it('resets a matrix to identity', () => {
    const m = matrix4.create(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    matrix4.identity(m);

    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('inverse', () => {
  it('inverse of identity is identity', () => {
    const m = matrix4.create();
    const inv = matrix4.create();
    matrix4.inverse(m, inv);

    expect(matrix4.equals(inv, matrix4.create())).toBe(true);
  });

  it('inverse of translation only negates translation', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 5, -3, 2);

    const inv = matrix4.create();
    matrix4.inverse(inv, m);

    expect(inv.m[12]).toBeCloseTo(-5); // Correct negative translation
    expect(inv.m[13]).toBeCloseTo(3); // Correct negative translation
    expect(inv.m[14]).toBeCloseTo(-2); // Correct negative translation

    // rotation part should stay identity
    expect(inv.m[0]).toBeCloseTo(1);
    expect(inv.m[5]).toBeCloseTo(1);
    expect(inv.m[10]).toBeCloseTo(1);
  });

  it('inverse of rotation-only matrix is its transpose', () => {
    const m = matrix4.create();
    matrix4.appendRotation(m, m, 90, Z_AXIS);

    const inv = matrix4.create();
    matrix4.inverse(m, inv);

    // m * inv = identity
    const check = matrix4.create();
    matrix4.multiply(m, inv, check);
    expect(matrix4.equals(check, matrix4.create())).toBe(true);
  });

  it('inverse of rotation + translation', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 5, 0, 0);
    matrix4.appendRotation(m, m, 90, Z_AXIS);

    const inv = matrix4.create();
    matrix4.inverse(m, inv);

    // m * inv = identity
    const check = matrix4.create();
    matrix4.multiply(m, inv, check);
    expect(matrix4.equals(check, matrix4.create())).toBe(true);
  });

  it('inverse of singular matrix should fail or produce NaN', () => {
    const m = matrix4.create();
    m.m[0] = 0; // make determinant zero

    const inv = matrix4.create();
    matrix4.inverse(inv, m);

    const det = matrix4.determinant(m);
    expect(det).toBeCloseTo(0);

    // Inverse should either be NaN or throw an error
    expect(inv.m[0]).toBeNaN();
    expect(inv.m[1]).toBeNaN();
    expect(inv.m[2]).toBeNaN();
    // or, if you prefer to throw an error:
    // expect(() => matrix4.inverse(m, inv)).toThrowError();
  });
});

describe('isAffine', () => {
  it('returns true for the identity matrix', () => {
    const m = matrix4.create();
    expect(matrix4.isAffine(m)).toBe(true);
  });

  it('returns true for a 2D transform matrix', () => {
    const m = matrix4.create2D(1, 0, 0, 1, 10, 20);
    expect(matrix4.isAffine(m)).toBe(true);
  });

  it('returns false if m[3] is non-zero', () => {
    const m = matrix4.create();
    m.m[3] = 1;
    expect(matrix4.isAffine(m)).toBe(false);
  });

  it('returns false if m[7] is non-zero', () => {
    const m = matrix4.create();
    m.m[7] = 1;
    expect(matrix4.isAffine(m)).toBe(false);
  });

  it('returns false if m[11] is non-zero', () => {
    const m = matrix4.create();
    m.m[11] = 1;
    expect(matrix4.isAffine(m)).toBe(false);
  });

  it('returns false if m[15] is not 1', () => {
    const m = matrix4.create();
    m.m[15] = 0;
    expect(matrix4.isAffine(m)).toBe(false);
  });
});

describe('multiply', () => {
  describe('multiply (identity)', () => {
    it('returns the right-hand operand when left is identity', () => {
      const I = matrix4.create();
      const T = matrix4.create2D(1, 0, 0, 1, 10, 20);

      const out = matrix4.create();
      matrix4.multiply(out, I, T);

      expect(matrix4.equals(out, T)).toBe(true);
    });

    it('returns the left-hand operand when right is identity', () => {
      const I = matrix4.create();
      const S = matrix4.create();
      matrix4.scale(S, S, 2, 3, 4);

      const out = matrix4.create();
      matrix4.multiply(out, S, I);

      expect(matrix4.equals(out, S)).toBe(true);
    });

    it('does not mutate inputs', () => {
      const a = matrix4.create();
      matrix4.translate(a, a, 1, 2, 3);
      const b = matrix4.create();
      matrix4.scale(b, b, 2, 2, 2);

      const aBefore = Array.from(a.m);
      const bBefore = Array.from(b.m);

      matrix4.multiply(matrix4.create(), a, b);

      expect(Array.from(a.m)).toEqual(aBefore);
      expect(Array.from(b.m)).toEqual(bBefore);
    });
  });

  describe('multiply', () => {
    it('post-multiplies by the given matrix', () => {
      const m = matrix4.create();
      matrix4.translate(m, m, 1, 0, 0);
      const s = matrix4.create();
      matrix4.scale(s, s, 2, 2, 2);

      matrix4.multiply(m, m, s);

      // translation then scale: position unaffected
      expect(m.m[12]).toBe(1);
      expect(m.m[0]).toBe(2);
    });
  });

  describe('multiply (ordering)', () => {
    it('translation × scale ≠ scale × translation', () => {
      const T = matrix4.create();
      matrix4.translate(T, T, 10, 0, 0);
      const S = matrix4.create();
      matrix4.scale(S, S, 2, 2, 2);

      const TS = matrix4.create();
      matrix4.multiply(TS, T, S);

      const ST = matrix4.create();
      matrix4.multiply(ST, S, T);

      // TS: translate, then scale → translation unaffected
      expect(TS.m[12]).toBe(10);

      // ST: scale, then translate → translation scaled
      expect(ST.m[12]).toBe(20);

      expect(matrix4.equals(TS, ST)).toBe(false);
    });
  });

  describe('multiply equivalence', () => {
    it('appendTranslation equals multiply by translation matrix', () => {
      const m1 = matrix4.create();
      matrix4.translate(m1, m1, 1, 2, 3);
      const m2 = matrix4.create();
      matrix4.translate(m2, m2, 1, 2, 3);

      const t = matrix4.create();
      matrix4.translate(t, t, 4, 5, 6);

      matrix4.appendTranslation(m1, m1, 4, 5, 6);
      matrix4.multiply(m2, m2, t);

      expect(matrix4.equals(m1, m2)).toBe(true);
    });

    it('prependScale equals multiply scale × matrix', () => {
      const m1 = matrix4.create();
      matrix4.translate(m1, m1, 10, 0, 0);
      const m2 = matrix4.create();
      matrix4.translate(m2, m2, 10, 0, 0);

      const s = matrix4.create();
      matrix4.scale(s, s, 2, 2, 2);

      matrix4.prependScale(m1, m1, 2, 2, 2);
      matrix4.multiply(m2, s, m2);

      expect(matrix4.equals(m1, m2)).toBe(true);
    });
  });
});

describe('position', () => {
  it('extracts translation components from the matrix', () => {
    const m = matrix4.create();
    m.m[12] = 10;
    m.m[13] = 20;
    m.m[14] = 30;

    const out = { x: 0, y: 0, z: 0 };

    matrix4.position(out, m);

    expect(out).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('does not mutate the source matrix', () => {
    const m = matrix4.create();
    const snapshot = Array.from(m.m);

    const out = { x: 0, y: 0, z: 0 };
    matrix4.position(out, m);

    expect(Array.from(m.m)).toEqual(snapshot);
  });
});

describe('prependRotation', () => {
  it('rotates identity around Z axis', () => {
    const m = matrix4.create();

    matrix4.prependRotation(m, m, 90, Z_AXIS);

    expect(m.m[0]).toBeCloseTo(0);
    expect(m.m[1]).toBeCloseTo(1);
  });

  it('rotates translation when prepending rotation', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 10, 0, 0);

    matrix4.prependRotation(m, m, 90, Z_AXIS);

    // (10, 0, 0) → (0, 10, 0)
    expect(m.m[12]).toBeCloseTo(0);
    expect(m.m[13]).toBeCloseTo(10);
  });
});

describe('prependScale', () => {
  it('scales an identity matrix', () => {
    const m = matrix4.create();

    matrix4.prependScale(m, m, 2, 3, 4);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });

  it('scales translation when prepending scale', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 10, 20, 30);

    matrix4.prependScale(m, m, 2, 3, 4);

    expect(m.m[12]).toBe(20); // 10 * 2
    expect(m.m[13]).toBe(60); // 20 * 3
    expect(m.m[14]).toBe(120); // 30 * 4
  });

  it('scale, appendScale, and prependScale behave the same on identity', () => {
    const a = matrix4.create();
    const b = matrix4.create();
    const c = matrix4.create();

    matrix4.scale(a, a, 2, 3, 4);
    matrix4.appendScale(b, b, 2, 3, 4);
    matrix4.prependScale(c, c, 2, 3, 4);

    expect(matrix4.equals(a, b)).toBe(true);
    expect(matrix4.equals(b, c)).toBe(true);
  });
});

describe('prependTranslation', () => {
  it('translates an identity matrix by (x, y, z)', () => {
    const m = matrix4.create();

    matrix4.prependTranslation(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(1);
    expect(m.m[13]).toBe(2);
    expect(m.m[14]).toBe(3);
  });

  it('prepends translation before existing transforms', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 10, 0, 0);

    matrix4.prependTranslation(m, m, 5, 0, 0);

    // world-space prepend: (5 + 10)
    expect(m.m[12]).toBe(15);
  });

  it('translate, appendTranslation, and prependTranslation behave the same on identity', () => {
    const a = matrix4.create();
    const b = matrix4.create();
    const c = matrix4.create();

    matrix4.translate(a, a, 1, 2, 3);
    matrix4.appendTranslation(b, b, 1, 2, 3);
    matrix4.prependTranslation(c, c, 1, 2, 3);

    expect(matrix4.equals(a, b)).toBe(true);
    expect(matrix4.equals(b, c)).toBe(true);
  });
});

describe('rotate', () => {
  it('matches appendRotation on identity', () => {
    const a = matrix4.create();
    const b = matrix4.create();

    matrix4.rotate(a, a, Z_AXIS, 90);
    matrix4.appendRotation(b, b, 90, Z_AXIS);

    expect(matrix4.equals(a, b)).toBe(true);
  });

  it('preserves translation when rotating locally', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 5, 0, 0);

    matrix4.rotate(m, m, Z_AXIS, 90);

    expect(m.m[12]).toBe(5);
    expect(m.m[13]).toBe(0);
  });

  it('rotation around X does not affect X axis basis vector', () => {
    const m = matrix4.create();

    matrix4.appendRotation(m, m, 90, X_AXIS);

    expect(m.m[0]).toBeCloseTo(1);
    expect(m.m[1]).toBeCloseTo(0);
    expect(m.m[2]).toBeCloseTo(0);
  });

  it('rotation around Y does not affect Y axis basis vector', () => {
    const m = matrix4.create();

    matrix4.appendRotation(m, m, 90, Y_AXIS);

    expect(m.m[4]).toBeCloseTo(0);
    expect(m.m[5]).toBeCloseTo(1);
    expect(m.m[6]).toBeCloseTo(0);
  });
});

describe('scale', () => {
  it('scales an identity matrix by (x, y, z)', () => {
    const m = matrix4.create();

    matrix4.scale(m, m, 2, 3, 4);

    expect(m.m[0]).toBe(2);
    expect(m.m[5]).toBe(3);
    expect(m.m[10]).toBe(4);
  });

  it('accumulates scale multiplicatively', () => {
    const m = matrix4.create();

    matrix4.scale(m, m, 2, 3, 4);
    matrix4.scale(m, m, 5, 6, 7);

    expect(m.m[0]).toBe(10); // 2 * 5
    expect(m.m[5]).toBe(18); // 3 * 6
    expect(m.m[10]).toBe(28); // 4 * 7
  });

  it('does not modify translation when scaling locally', () => {
    const m = matrix4.create();
    matrix4.translate(m, m, 10, 20, 30);

    matrix4.scale(m, m, 2, 3, 4);

    expect(m.m[12]).toBe(10);
    expect(m.m[13]).toBe(20);
    expect(m.m[14]).toBe(30);
  });
});

describe('setTo', () => {
  it('sets all 16 values in column-major order', () => {
    const m = matrix4.create();

    matrix4.setTo(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);

    expect(Array.from(m.m)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('overwrites existing matrix values completely', () => {
    const m = matrix4.create(99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99);

    matrix4.setTo(m, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

    expect(Array.from(m.m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('set2D', () => {
  it('sets a 2D transform with translation', () => {
    const m = matrix4.create();

    matrix4.set2D(m, 1, 2, 3, 4, 5, 6);

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
    const m = matrix4.create();

    matrix4.set2D(m, 7, 8, 9, 10);

    expect(m.m[12]).toBe(0);
    expect(m.m[13]).toBe(0);
  });

  it('produces an affine matrix', () => {
    const m = matrix4.create();

    matrix4.set2D(m, 1, 0, 0, 1, 0, 0);

    expect(matrix4.isAffine(m)).toBe(true);
  });

  it('sets Z axis to identity', () => {
    const m = matrix4.create();

    matrix4.set2D(m, 1, 2, 3, 4);

    expect(m.m[10]).toBe(1); // z-scale
    expect(m.m[2]).toBe(0);
    expect(m.m[6]).toBe(0);
    expect(m.m[14]).toBe(0);
  });
});

describe('setPosition', () => {
  it('sets the translation components of the matrix', () => {
    const m = matrix4.create();

    matrix4.setPosition(m, { x: 5, y: 6, z: 7 });

    expect(m.m[12]).toBe(5);
    expect(m.m[13]).toBe(6);
    expect(m.m[14]).toBe(7);
  });

  it('does not modify other matrix values', () => {
    const m = matrix4.create();
    const before = Array.from(m.m);

    matrix4.setPosition(m, { x: 1, y: 2, z: 3 });

    expect(m.m[0]).toBe(before[0]);
    expect(m.m[5]).toBe(before[5]);
    expect(m.m[10]).toBe(before[10]);
    expect(m.m[15]).toBe(before[15]);
  });

  it('can overwrite an existing translation', () => {
    const m = matrix4.create();
    matrix4.setPosition(m, { x: 1, y: 2, z: 3 });
    matrix4.setPosition(m, { x: -1, y: -2, z: -3 });

    expect(m.m[12]).toBe(-1);
    expect(m.m[13]).toBe(-2);
    expect(m.m[14]).toBe(-3);
  });
});

describe('translate', () => {
  it('translates an identity matrix by (x, y, z)', () => {
    const m = matrix4.create();

    matrix4.translate(m, m, 1, 2, 3);

    expect(m.m[12]).toBe(1);
    expect(m.m[13]).toBe(2);
    expect(m.m[14]).toBe(3);
  });

  it('accumulates translation when called multiple times', () => {
    const m = matrix4.create();

    matrix4.translate(m, m, 1, 2, 3);
    matrix4.translate(m, m, 4, 5, 6);

    expect(m.m[12]).toBe(5);
    expect(m.m[13]).toBe(7);
    expect(m.m[14]).toBe(9);
  });
});

describe('transpose', () => {
  it('transpose of identity is identity', () => {
    const m = matrix4.create();
    const t = matrix4.create();
    matrix4.transpose(t, m);
    expect(matrix4.equals(t, m)).toBe(true);
  });

  it('transpose of diagonal matrix is itself', () => {
    const m = matrix4.create();
    matrix4.scale(m, m, 2, 3, 4); // diagonal elements only
    const t = matrix4.create();
    matrix4.transpose(t, m);
    expect(matrix4.equals(t, m)).toBe(true);
  });

  it('transpose of rotation matrix equals its inverse', () => {
    const m = matrix4.create();
    matrix4.appendRotation(m, m, 90, Z_AXIS);

    const t = matrix4.create();
    matrix4.transpose(t, m);
    const inv = matrix4.create();
    matrix4.inverse(inv, m);

    // element-wise close comparison
    for (let i = 0; i < 16; i++) {
      expect(t.m[i]).toBeCloseTo(inv.m[i]);
    }
  });

  it('transpose of arbitrary matrix swaps rows and columns', () => {
    const m = matrix4.create();
    matrix4.setTo(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const t = matrix4.create();
    matrix4.transpose(t, m);
    const values = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16];
    for (let i = 0; i < values.length; i++) {
      expect(t.m[i]).toBe(values[i]);
    }
  });

  it('transpose twice returns original matrix', () => {
    const m = matrix4.create();
    matrix4.setTo(m, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    const t = matrix4.create();
    matrix4.transpose(t, m);
    const t2 = matrix4.create();
    matrix4.transpose(t2, t);
    expect(matrix4.equals(t2, m)).toBe(true);
  });
});
