import type { Matrix3x3 } from '@flighthq/types';

import * as matrix3x2 from './matrix3x2.js';
import * as matrix3x3 from './matrix3x3.js';
import * as vector3 from './vector3.js';

describe('create', () => {
  it('should initialize matrix with provided values', () => {
    const m = matrix3x3.create(2, 3, 4, 5, 6, 7, 8, 9, 10);
    expect(matrix3x3.get(m, 0, 0)).toBe(2);
    expect(matrix3x3.get(m, 0, 1)).toBe(3);
    expect(matrix3x3.get(m, 0, 2)).toBe(4);
    expect(matrix3x3.get(m, 1, 0)).toBe(5);
    expect(matrix3x3.get(m, 1, 1)).toBe(6);
    expect(matrix3x3.get(m, 1, 2)).toBe(7);
    expect(matrix3x3.get(m, 2, 0)).toBe(8);
    expect(matrix3x3.get(m, 2, 1)).toBe(9);
    expect(matrix3x3.get(m, 2, 2)).toBe(10);
  });

  it('should default to identity matrix when no values are provided', () => {
    const m = matrix3x3.create();
    expect(matrix3x3.get(m, 0, 0)).toBe(1);
    expect(matrix3x3.get(m, 0, 1)).toBe(0);
    expect(matrix3x3.get(m, 0, 2)).toBe(0);
    expect(matrix3x3.get(m, 1, 0)).toBe(0);
    expect(matrix3x3.get(m, 1, 1)).toBe(1);
    expect(matrix3x3.get(m, 1, 2)).toBe(0);
    expect(matrix3x3.get(m, 2, 0)).toBe(0);
    expect(matrix3x3.get(m, 2, 1)).toBe(0);
    expect(matrix3x3.get(m, 2, 2)).toBe(1);
  });
});

describe('clone', () => {
  it('should clone the matrix correctly', () => {
    const m1 = matrix3x3.create(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const m2 = matrix3x3.clone(m1);
    expect(matrix3x3.get(m2, 0, 0)).toBe(2);
    expect(matrix3x3.get(m2, 0, 1)).toBe(3);
    expect(matrix3x3.get(m2, 0, 2)).toBe(4);
    expect(matrix3x3.get(m2, 1, 0)).toBe(5);
    expect(matrix3x3.get(m2, 1, 1)).toBe(6);
    expect(matrix3x3.get(m2, 1, 2)).toBe(7);
    expect(matrix3x3.get(m2, 2, 0)).toBe(8);
    expect(matrix3x3.get(m2, 2, 1)).toBe(9);
    expect(matrix3x3.get(m2, 2, 2)).toBe(10);
  });

  it('should also clone matrix-like objects', () => {
    const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
    const m2 = matrix3x3.clone(obj);
    expect(matrix3x3.get(m2, 0, 0)).toBe(2);
    expect(matrix3x3.get(m2, 0, 1)).toBe(3);
    expect(matrix3x3.get(m2, 0, 2)).toBe(4);
    expect(matrix3x3.get(m2, 1, 0)).toBe(5);
    expect(matrix3x3.get(m2, 1, 1)).toBe(6);
    expect(matrix3x3.get(m2, 1, 2)).toBe(7);
    expect(matrix3x3.get(m2, 2, 0)).toBe(8);
    expect(matrix3x3.get(m2, 2, 1)).toBe(9);
    expect(matrix3x3.get(m2, 2, 2)).toBe(10);
  });

  it('should return a matrix instance', () => {
    const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
    const m2: Matrix3x3 = matrix3x3.clone(obj);
    expect(m2).not.toBeNull();
  });
});

describe('copy', () => {
  it('should copy matrix values from another matrix', () => {
    const m1 = matrix3x3.create(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const m2 = matrix3x3.create();
    matrix3x3.copy(m2, m1);
    expect(matrix3x3.get(m2, 0, 0)).toBe(2);
    expect(matrix3x3.get(m2, 0, 1)).toBe(3);
    expect(matrix3x3.get(m2, 0, 2)).toBe(4);
    expect(matrix3x3.get(m2, 1, 0)).toBe(5);
    expect(matrix3x3.get(m2, 1, 1)).toBe(6);
    expect(matrix3x3.get(m2, 1, 2)).toBe(7);
    expect(matrix3x3.get(m2, 2, 0)).toBe(8);
    expect(matrix3x3.get(m2, 2, 1)).toBe(9);
    expect(matrix3x3.get(m2, 2, 2)).toBe(10);
  });
});

describe('copyColumnFrom', () => {
  it('should copy column from a Vector3 to a Matrix3x3', () => {
    const m = matrix3x3.create();
    const v = vector3.create(1, 2, 3);
    matrix3x3.copyColumnFrom(m, 0, v); // column 0
    expect(matrix3x3.get(m, 0, 0)).toBe(1);
    expect(matrix3x3.get(m, 1, 0)).toBe(2);
    expect(matrix3x3.get(m, 2, 0)).toBe(3);
  });

  it('should copy column 1 (c, d)', () => {
    const m = matrix3x3.create();
    const v = vector3.create(3, 4, 5);
    matrix3x3.copyColumnFrom(m, 1, v);
    expect(matrix3x3.get(m, 0, 1)).toBe(3);
    expect(matrix3x3.get(m, 1, 1)).toBe(4);
    expect(matrix3x3.get(m, 2, 1)).toBe(5);
  });

  it('should copy column 2 (tx, ty)', () => {
    const m = matrix3x3.create();
    const v = vector3.create(5, 6, 7);
    matrix3x3.copyColumnFrom(m, 2, v);
    expect(matrix3x3.get(m, 0, 2)).toBe(5);
    expect(matrix3x3.get(m, 1, 2)).toBe(6);
    expect(matrix3x3.get(m, 2, 2)).toBe(7);
  });

  it('should throw when column is greater than 2', () => {
    const m = matrix3x3.create();
    const v = vector3.create();
    expect(() => matrix3x3.copyColumnFrom(m, 3, v)).toThrow();
  });
});

describe('copyColumnTo', () => {
  it('should copy column to a Vector3 from a Matrix3x3', () => {
    const m = matrix3x3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3x3.copyColumnTo(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(4);
    expect(v.z).toBe(7);
  });

  it('should copy column 1 into Vector3', () => {
    const m = matrix3x3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3x3.copyColumnTo(v, 1, m);
    expect(v.x).toBe(2);
    expect(v.y).toBe(5);
    expect(v.z).toBe(8);
  });

  it('should copy column 2 into Vector3', () => {
    const m = matrix3x3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3x3.copyColumnTo(v, 2, m);
    expect(v.x).toBe(3);
    expect(v.y).toBe(6);
    expect(v.z).toBe(9);
  });

  it('should throw when column is greater than 2', () => {
    const m = matrix3x3.create();
    const v = vector3.create();
    expect(() => matrix3x3.copyColumnTo(v, 3, m)).toThrow();
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const v = { x: 0, y: 0, z: 0 };
    matrix3x3.copyColumnTo(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(4);
    expect(v.z).toBe(7);
  });
});

describe('copyRowFrom', () => {
  it('should copy row from a Vector3 to a Matrix3x3', () => {
    const m = matrix3x3.create();
    const v = vector3.create(1, 2, 3);
    matrix3x3.copyRowFrom(m, 0, v); // row 0
    expect(matrix3x3.get(m, 0, 0)).toBe(1);
    expect(matrix3x3.get(m, 0, 1)).toBe(2);
    expect(matrix3x3.get(m, 0, 2)).toBe(3);
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = matrix3x3.create();
    const v = vector3.create(2, 4, 6);
    matrix3x3.copyRowFrom(m, 1, v);
    expect(matrix3x3.get(m, 1, 0)).toBe(2);
    expect(matrix3x3.get(m, 1, 1)).toBe(4);
    expect(matrix3x3.get(m, 1, 2)).toBe(6);
  });

  it('should throw when row is greater than 2', () => {
    const m = matrix3x3.create();
    const v = vector3.create();
    expect(() => matrix3x3.copyRowFrom(m, 3, v)).toThrow();
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const v = { x: 1, y: 2, z: 3 };
    matrix3x3.copyRowFrom(m, 0, v); // row 0
    expect(m.m[0]).toBe(1);
    expect(m.m[1]).toBe(2);
    expect(m.m[2]).toBe(3);
  });
});

describe('copyRowTo', () => {
  it('should copy row to a Vector3 from a Matrix3x3', () => {
    const m = matrix3x3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3x3.copyRowTo(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(2); // m.c
    expect(v.z).toBe(3); // m.tx
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = matrix3x3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3x3.copyRowTo(v, 1, m);
    expect(v.x).toBe(4);
    expect(v.y).toBe(5);
    expect(v.z).toBe(6);
  });

  it('should return (0, 0, 1) for row 2', () => {
    const m = matrix3x3.create();
    const v = vector3.create();
    matrix3x3.copyRowTo(v, 2, m);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(1);
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const v = { x: 0, y: 0, z: 0 };
    matrix3x3.copyRowTo(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(2); // m.c
    expect(v.z).toBe(3); // m.tx
  });
});

describe('equals', () => {
  it('should return false if one matrix is null and the other is not', () => {
    const mat1 = matrix3x3.create();
    expect(matrix3x3.equals(mat1, null)).toBe(false);
  });

  it('should return false if one matrix is undefined and the other is not', () => {
    const mat1 = matrix3x3.create();
    expect(matrix3x3.equals(mat1, undefined)).toBe(false);
  });

  it('should return true if both matrix objects are null', () => {
    expect(matrix3x3.equals(null, null)).toBe(true);
  });

  it('should return true if both matrix objects are undefined', () => {
    expect(matrix3x3.equals(undefined, undefined)).toBe(true);
  });

  it('should return true if one matrix object is undefined and the other is null', () => {
    expect(matrix3x3.equals(undefined, undefined)).toBe(true);
  });

  it('should return false if both matrix objects are defined and have different values', () => {
    const mat1 = matrix3x3.create();
    const mat2 = matrix3x3.create();
    mat2.m[0] = 2;
    expect(matrix3x3.equals(mat1, mat2)).toBe(false);
  });

  it('should return true if one object is matrix-like and one is not', () => {
    const mat1 = matrix3x3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    expect(matrix3x3.equals(mat1, mat2)).toBe(true);
  });

  it('should return true if both object are matrix-like', () => {
    const mat1 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    expect(matrix3x3.equals(mat1, mat2)).toBe(true);
  });
});

describe('fromMatrix3x2', () => {
  it('should convert a Matrix3x2 to a Matrix3x3', () => {
    // Define a matrix (6 values, row-major)
    const mat2D = matrix3x2.create();

    // Define an empty Matrix3x3 to store the result
    const mat = matrix3x3.create();

    // Call the fromMatrix3x2 function
    matrix3x3.fromMatrix3x2(mat, mat2D);

    // Expected result: Identity matrix for Matrix3x3
    const expectedMatrix3x3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    // Assert that the result matches the expected outcome
    expect(mat.m).toEqual(expectedMatrix3x3);
  });

  it('should handle scaling and translation', () => {
    // Define a matrix with scaling and translation
    const mat2D = matrix3x2.create(2, 0, 0, 3, 5, 10); // Scaling by 2,3 and translation by (5,10)

    // Define an empty Matrix3x3 to store the result
    const mat = matrix3x3.create();

    // Call the fromMatrix3x2 function
    matrix3x3.fromMatrix3x2(mat, mat2D);

    // Expected result: Scaling and translation in Matrix3x3
    const expectedMatrix3x3 = new Float32Array([2, 0, 5, 0, 3, 10, 0, 0, 1]);

    // Assert that the result matches the expected outcome
    expect(mat.m).toEqual(expectedMatrix3x3);
  });
});

describe('fromMatrix4x4', () => {
  it('should convert an identity Matrix4x4 to a Matrix3x3', () => {
    const Matrix4x4 = {
      m: new Float32Array([
        1,
        0,
        0,
        0, // First column
        0,
        1,
        0,
        0, // Second column
        0,
        0,
        1,
        0, // Third column
        3,
        4,
        5,
        1, // Translation (m[12], m[13], m[14])
      ]),
    };

    const mat = matrix3x3.create();
    matrix3x3.fromMatrix4x4(mat, Matrix4x4);

    // Expected result: Identity matrix for Matrix3x3
    const expectedMatrix3x3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix3x3);
  });

  it('should handle non-identity Matrix4x4 correctly', () => {
    const Matrix4x4 = {
      m: new Float32Array([
        2,
        0,
        0,
        0, // First column (scaling by 2)
        0,
        3,
        0,
        0, // Second column (scaling by 3)
        0,
        0,
        4,
        0, // Third column (scaling by 4)
        5,
        6,
        7,
        1, // Translation (m[12], m[13], m[14])
      ]),
    };

    const mat = matrix3x3.create();
    matrix3x3.fromMatrix4x4(mat, Matrix4x4);

    // Expected result: Upper-left 3x3 part of Matrix4x4
    const expectedMatrix3x3 = new Float32Array([2, 0, 0, 0, 3, 0, 0, 0, 4]);

    expect(mat.m).toEqual(expectedMatrix3x3);
  });
});

describe('inverse', () => {
  it('should invert the matrix correctly', () => {
    // Create a matrix with scaling of 2 and translation of (5, 3)
    const m = matrix3x3.create(2, 0, 5, 0, 2, 3, 0, 0, 1);

    // Apply inversion
    let out = matrix3x3.create();
    matrix3x3.inverse(out, m);

    // Expected inverse matrix:
    // Scaling should be 0.5 (inverse of 2)
    // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

    // Assert the inverse matrix values
    expect(out.m[0]).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.m[1]).toBeCloseTo(0); // No shear on x
    expect(out.m[3]).toBeCloseTo(0); // No shear on y
    expect(out.m[4]).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.m[2]).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.m[5]).toBeCloseTo(-1.5); // Inverse translation on y
  });

  it('should not depend on initial out matrix values', () => {
    const source = matrix3x3.create(2, 1, 5, 3, 4, 6, 0, 0, 1);
    const out = matrix3x3.create(9, 9, 9, 9, 9, 9, 0, 0, 1);

    matrix3x3.inverse(out, source);

    const result = matrix3x3.create();
    matrix3x3.multiply(result, source, out);

    expect(result.m[0]).toBeCloseTo(1);
    expect(result.m[1]).toBeCloseTo(0);
    expect(result.m[3]).toBeCloseTo(0);
    expect(result.m[4]).toBeCloseTo(1);
  });

  it('should should allow matrix-like objects', () => {
    const m = { m: new Float32Array([2, 0, 5, 0, 2, 3, 0, 0, 1]) };
    let out = { m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]) };
    matrix3x3.inverse(out, m);
    expect(out.m[0]).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.m[1]).toBeCloseTo(0); // No shear on x
    expect(out.m[3]).toBeCloseTo(0); // No shear on y
    expect(out.m[4]).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.m[2]).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.m[5]).toBeCloseTo(-1.5); // Inverse translation on y
  });
});

describe('multiply', () => {
  it('should support out === a', () => {
    const a = matrix3x3.create(2, 0, 0, 0, 2, 0, 0, 0, 1);
    const b = matrix3x3.create(1, 0, 5, 0, 1, 5, 0, 0, 1);
    matrix3x3.multiply(a, a, b);
    expect(a.m[2]).toBe(10);
    expect(a.m[5]).toBe(10);
  });

  it('should support out === b', () => {
    const a = matrix3x3.create(2, 0, 0, 0, 2, 0, 0, 0, 1);
    const b = matrix3x3.create(1, 0, 3, 0, 1, 4, 0, 0, 1);
    matrix3x3.multiply(b, a, b); // Multiply a by b and store the result in b
    expect(b.m[0]).toBe(2); // a[0][0] = 2
    expect(b.m[4]).toBe(2); // d[1][1] = 2
    expect(b.m[2]).toBe(6); // tx = b[0][2] = 6
    expect(b.m[5]).toBe(8); // ty = b[1][2] = 8
  });

  it('should multiply identity correctly', () => {
    const a = matrix3x3.create();
    const b = matrix3x3.create(2, 3, 4, 5, 6, 7);
    const out = matrix3x3.create();
    matrix3x3.multiply(out, a, b);
    expect(matrix3x3.equals(out, b)).toBe(true);
  });

  it('should allow matrix-like objects', () => {
    const a = { m: new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 1]) };
    const b = { m: new Float32Array([1, 0, 5, 0, 1, 5, 0, 0, 1]) };
    matrix3x3.multiply(a, a, b);
    expect(a.m[2]).toBe(10);
    expect(a.m[5]).toBe(10);
  });
});

describe('rotate', () => {
  it('should rotate the matrix correctly', () => {
    const m = matrix3x3.create(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const out = matrix3x3.create();
    matrix3x3.rotate(out, m, Math.PI / 2); // 90 degrees
    expect(out.m[0]).toBeCloseTo(0);
    expect(out.m[1]).toBeCloseTo(-1);
    expect(out.m[3]).toBeCloseTo(1);
    expect(out.m[4]).toBeCloseTo(0);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };

    // Apply 90 degrees rotation (π/2 radians)
    matrix3x3.rotate(out, m, Math.PI / 2);

    // Check that the resulting matrix corresponds to a 90-degree rotation matrix
    expect(out.m[0]).toBeCloseTo(0); // a = cos(π/2) = 0
    expect(out.m[1]).toBeCloseTo(-1); // b = -sin(π/2) = -1
    expect(out.m[3]).toBeCloseTo(1); // c = sin(π/2) = 1
    expect(out.m[4]).toBeCloseTo(0); // d = cos(π/2) = 0
  });
});

describe('scale', () => {
  it('should scale the matrix correctly', () => {
    const m = matrix3x3.create();
    const out = matrix3x3.create();
    matrix3x3.scale(out, m, 2, 3);
    expect(out.m[0]).toBe(2);
    expect(out.m[4]).toBe(3);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = matrix3x3.create();
    matrix3x3.scale(out, m, 2, 3);
    expect(out.m[0]).toBe(2); // a
    expect(out.m[4]).toBe(3); // d
  });
});

describe('translate', () => {
  it('should translate the matrix correctly', () => {
    const m = matrix3x3.create();
    const out = matrix3x3.create();
    matrix3x3.translate(out, m, 2, 3);
    expect(out.m[2]).toBe(2);
    expect(out.m[5]).toBe(3);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = matrix3x3.create();
    matrix3x3.translate(out, m, 2, 3);
    expect(out.m[2]).toBe(2); // tx
    expect(out.m[5]).toBe(3); // ty
  });
});
