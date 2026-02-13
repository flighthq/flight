import type { Matrix3 } from '@flighthq/types';

import * as matrix2D from './matrix2D.js';
import * as matrix3 from './matrix3.js';
import * as vector3 from './vector3.js';

describe('create', () => {
  it('should initialize matrix with provided values', () => {
    const m = matrix3.create(2, 3, 4, 5, 6, 7, 8, 9, 10);
    expect(matrix3.get(m, 0, 0)).toBe(2);
    expect(matrix3.get(m, 0, 1)).toBe(3);
    expect(matrix3.get(m, 0, 2)).toBe(4);
    expect(matrix3.get(m, 1, 0)).toBe(5);
    expect(matrix3.get(m, 1, 1)).toBe(6);
    expect(matrix3.get(m, 1, 2)).toBe(7);
    expect(matrix3.get(m, 2, 0)).toBe(8);
    expect(matrix3.get(m, 2, 1)).toBe(9);
    expect(matrix3.get(m, 2, 2)).toBe(10);
  });

  it('should default to identity matrix when no values are provided', () => {
    const m = matrix3.create();
    expect(matrix3.get(m, 0, 0)).toBe(1);
    expect(matrix3.get(m, 0, 1)).toBe(0);
    expect(matrix3.get(m, 0, 2)).toBe(0);
    expect(matrix3.get(m, 1, 0)).toBe(0);
    expect(matrix3.get(m, 1, 1)).toBe(1);
    expect(matrix3.get(m, 1, 2)).toBe(0);
    expect(matrix3.get(m, 2, 0)).toBe(0);
    expect(matrix3.get(m, 2, 1)).toBe(0);
    expect(matrix3.get(m, 2, 2)).toBe(1);
  });
});

describe('clone', () => {
  it('should clone the matrix correctly', () => {
    const m1 = matrix3.create(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const m2 = matrix3.clone(m1);
    expect(matrix3.get(m2, 0, 0)).toBe(2);
    expect(matrix3.get(m2, 0, 1)).toBe(3);
    expect(matrix3.get(m2, 0, 2)).toBe(4);
    expect(matrix3.get(m2, 1, 0)).toBe(5);
    expect(matrix3.get(m2, 1, 1)).toBe(6);
    expect(matrix3.get(m2, 1, 2)).toBe(7);
    expect(matrix3.get(m2, 2, 0)).toBe(8);
    expect(matrix3.get(m2, 2, 1)).toBe(9);
    expect(matrix3.get(m2, 2, 2)).toBe(10);
  });

  it('should also clone matrix-like objects', () => {
    const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
    const m2 = matrix3.clone(obj);
    expect(matrix3.get(m2, 0, 0)).toBe(2);
    expect(matrix3.get(m2, 0, 1)).toBe(3);
    expect(matrix3.get(m2, 0, 2)).toBe(4);
    expect(matrix3.get(m2, 1, 0)).toBe(5);
    expect(matrix3.get(m2, 1, 1)).toBe(6);
    expect(matrix3.get(m2, 1, 2)).toBe(7);
    expect(matrix3.get(m2, 2, 0)).toBe(8);
    expect(matrix3.get(m2, 2, 1)).toBe(9);
    expect(matrix3.get(m2, 2, 2)).toBe(10);
  });

  it('should return a matrix instance', () => {
    const obj = { m: new Float32Array([2, 3, 4, 5, 6, 7, 8, 9, 10]) };
    const m2: Matrix3 = matrix3.clone(obj);
    expect(m2).not.toBeNull();
  });
});

describe('copy', () => {
  it('should copy matrix values from another matrix', () => {
    const m1 = matrix3.create(2, 3, 4, 5, 6, 7, 8, 9, 10);
    const m2 = matrix3.create();
    matrix3.copy(m2, m1);
    expect(matrix3.get(m2, 0, 0)).toBe(2);
    expect(matrix3.get(m2, 0, 1)).toBe(3);
    expect(matrix3.get(m2, 0, 2)).toBe(4);
    expect(matrix3.get(m2, 1, 0)).toBe(5);
    expect(matrix3.get(m2, 1, 1)).toBe(6);
    expect(matrix3.get(m2, 1, 2)).toBe(7);
    expect(matrix3.get(m2, 2, 0)).toBe(8);
    expect(matrix3.get(m2, 2, 1)).toBe(9);
    expect(matrix3.get(m2, 2, 2)).toBe(10);
  });
});

describe('copyColumnFrom', () => {
  it('should copy column from a Vector3 to a Matrix3', () => {
    const m = matrix3.create();
    const v = vector3.create(1, 2, 3);
    matrix3.copyColumnFrom(m, 0, v); // column 0
    expect(matrix3.get(m, 0, 0)).toBe(1);
    expect(matrix3.get(m, 1, 0)).toBe(2);
    expect(matrix3.get(m, 2, 0)).toBe(3);
  });

  it('should copy column 1 (c, d)', () => {
    const m = matrix3.create();
    const v = vector3.create(3, 4, 5);
    matrix3.copyColumnFrom(m, 1, v);
    expect(matrix3.get(m, 0, 1)).toBe(3);
    expect(matrix3.get(m, 1, 1)).toBe(4);
    expect(matrix3.get(m, 2, 1)).toBe(5);
  });

  it('should copy column 2 (tx, ty)', () => {
    const m = matrix3.create();
    const v = vector3.create(5, 6, 7);
    matrix3.copyColumnFrom(m, 2, v);
    expect(matrix3.get(m, 0, 2)).toBe(5);
    expect(matrix3.get(m, 1, 2)).toBe(6);
    expect(matrix3.get(m, 2, 2)).toBe(7);
  });

  it('should throw when column is greater than 2', () => {
    const m = matrix3.create();
    const v = vector3.create();
    expect(() => matrix3.copyColumnFrom(m, 3, v)).toThrow();
  });
});

describe('copyColumnTo', () => {
  it('should copy column to a Vector3 from a Matrix3', () => {
    const m = matrix3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3.copyColumnTo(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(4);
    expect(v.z).toBe(7);
  });

  it('should copy column 1 into Vector3', () => {
    const m = matrix3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3.copyColumnTo(v, 1, m);
    expect(v.x).toBe(2);
    expect(v.y).toBe(5);
    expect(v.z).toBe(8);
  });

  it('should copy column 2 into Vector3', () => {
    const m = matrix3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3.copyColumnTo(v, 2, m);
    expect(v.x).toBe(3);
    expect(v.y).toBe(6);
    expect(v.z).toBe(9);
  });

  it('should throw when column is greater than 2', () => {
    const m = matrix3.create();
    const v = vector3.create();
    expect(() => matrix3.copyColumnTo(v, 3, m)).toThrow();
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const v = { x: 0, y: 0, z: 0 };
    matrix3.copyColumnTo(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(4);
    expect(v.z).toBe(7);
  });
});

describe('copyRowFrom', () => {
  it('should copy row from a Vector3 to a Matrix3', () => {
    const m = matrix3.create();
    const v = vector3.create(1, 2, 3);
    matrix3.copyRowFrom(m, 0, v); // row 0
    expect(matrix3.get(m, 0, 0)).toBe(1);
    expect(matrix3.get(m, 0, 1)).toBe(2);
    expect(matrix3.get(m, 0, 2)).toBe(3);
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = matrix3.create();
    const v = vector3.create(2, 4, 6);
    matrix3.copyRowFrom(m, 1, v);
    expect(matrix3.get(m, 1, 0)).toBe(2);
    expect(matrix3.get(m, 1, 1)).toBe(4);
    expect(matrix3.get(m, 1, 2)).toBe(6);
  });

  it('should throw when row is greater than 2', () => {
    const m = matrix3.create();
    const v = vector3.create();
    expect(() => matrix3.copyRowFrom(m, 3, v)).toThrow();
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const v = { x: 1, y: 2, z: 3 };
    matrix3.copyRowFrom(m, 0, v); // row 0
    expect(m.m[0]).toBe(1);
    expect(m.m[1]).toBe(2);
    expect(m.m[2]).toBe(3);
  });
});

describe('copyRowTo', () => {
  it('should copy row to a Vector3 from a Matrix3', () => {
    const m = matrix3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3.copyRowTo(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(2); // m.c
    expect(v.z).toBe(3); // m.tx
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = matrix3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const v = vector3.create();
    matrix3.copyRowTo(v, 1, m);
    expect(v.x).toBe(4);
    expect(v.y).toBe(5);
    expect(v.z).toBe(6);
  });

  it('should return (0, 0, 1) for row 2', () => {
    const m = matrix3.create();
    const v = vector3.create();
    matrix3.copyRowTo(v, 2, m);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(1);
  });

  it('should allow matrix-like and vector-like objects', () => {
    const m = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const v = { x: 0, y: 0, z: 0 };
    matrix3.copyRowTo(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(2); // m.c
    expect(v.z).toBe(3); // m.tx
  });
});

describe('equals', () => {
  it('should return false if one matrix is null and the other is not', () => {
    const mat1 = matrix3.create();
    expect(matrix3.equals(mat1, null)).toBe(false);
  });

  it('should return false if one matrix is undefined and the other is not', () => {
    const mat1 = matrix3.create();
    expect(matrix3.equals(mat1, undefined)).toBe(false);
  });

  it('should return true if both matrix objects are null', () => {
    expect(matrix3.equals(null, null)).toBe(true);
  });

  it('should return true if both matrix objects are undefined', () => {
    expect(matrix3.equals(undefined, undefined)).toBe(true);
  });

  it('should return true if one matrix object is undefined and the other is null', () => {
    expect(matrix3.equals(undefined, undefined)).toBe(true);
  });

  it('should return false if both matrix objects are defined and have different values', () => {
    const mat1 = matrix3.create();
    const mat2 = matrix3.create();
    mat2.m[0] = 2;
    expect(matrix3.equals(mat1, mat2)).toBe(false);
  });

  it('should return true if one object is matrix-like and one is not', () => {
    const mat1 = matrix3.create(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    expect(matrix3.equals(mat1, mat2)).toBe(true);
  });

  it('should return true if both object are matrix-like', () => {
    const mat1 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const mat2 = { m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    expect(matrix3.equals(mat1, mat2)).toBe(true);
  });
});

describe('fromMatrix2D', () => {
  it('should convert an Affine2D matrix to a Matrix3', () => {
    // Define an Affine2D matrix (6 values, row-major)
    const mat2D = matrix2D.create();

    // Define an empty Matrix3 to store the result
    const mat = matrix3.create();

    // Call the fromMatrix2D function
    matrix3.fromMatrix2D(mat, mat2D);

    // Expected result: Identity matrix for Matrix3
    const expectedMatrix3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    // Assert that the result matches the expected outcome
    expect(mat.m).toEqual(expectedMatrix3);
  });

  it('should handle scaling and translation', () => {
    // Define an Affine2D matrix with scaling and translation
    const mat2D = matrix2D.create(2, 0, 0, 3, 5, 10); // Scaling by 2,3 and translation by (5,10)

    // Define an empty Matrix3 to store the result
    const mat = matrix3.create();

    // Call the fromAffine2D function
    matrix3.fromMatrix2D(mat, mat2D);

    // Expected result: Scaling and translation in Matrix3
    const expectedMatrix3 = new Float32Array([2, 0, 5, 0, 3, 10, 0, 0, 1]);

    // Assert that the result matches the expected outcome
    expect(mat.m).toEqual(expectedMatrix3);
  });
});

describe('fromMatrix4', () => {
  it('should convert an identity Matrix4 to a Matrix3', () => {
    const matrix4 = {
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

    const mat = matrix3.create();
    matrix3.fromMatrix4(mat, matrix4);

    // Expected result: Identity matrix for Matrix3
    const expectedMatrix3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    expect(mat.m).toEqual(expectedMatrix3);
  });

  it('should handle non-identity Matrix4 correctly', () => {
    const matrix4 = {
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

    const mat = matrix3.create();
    matrix3.fromMatrix4(mat, matrix4);

    // Expected result: Upper-left 3x3 part of Matrix4
    const expectedMatrix3 = new Float32Array([2, 0, 0, 0, 3, 0, 0, 0, 4]);

    expect(mat.m).toEqual(expectedMatrix3);
  });
});

describe('inverse', () => {
  it('should invert the matrix correctly', () => {
    // Create a matrix with scaling of 2 and translation of (5, 3)
    const m = matrix3.create(2, 0, 5, 0, 2, 3, 0, 0, 1);

    // Apply inversion
    let out = matrix3.create();
    matrix3.inverse(out, m);

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
    const source = matrix3.create(2, 1, 5, 3, 4, 6, 0, 0, 1);
    const out = matrix3.create(9, 9, 9, 9, 9, 9, 0, 0, 1);

    matrix3.inverse(out, source);

    const result = matrix3.create();
    matrix3.multiply(result, source, out);

    expect(result.m[0]).toBeCloseTo(1);
    expect(result.m[1]).toBeCloseTo(0);
    expect(result.m[3]).toBeCloseTo(0);
    expect(result.m[4]).toBeCloseTo(1);
  });

  it('should should allow matrix-like objects', () => {
    const m = { m: new Float32Array([2, 0, 5, 0, 2, 3, 0, 0, 1]) };
    let out = { m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]) };
    matrix3.inverse(out, m);
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
    const a = matrix3.create(2, 0, 0, 0, 2, 0, 0, 0, 1);
    const b = matrix3.create(1, 0, 5, 0, 1, 5, 0, 0, 1);
    matrix3.multiply(a, a, b);
    expect(a.m[2]).toBe(10);
    expect(a.m[5]).toBe(10);
  });

  it('should support out === b', () => {
    const a = matrix3.create(2, 0, 0, 0, 2, 0, 0, 0, 1);
    const b = matrix3.create(1, 0, 3, 0, 1, 4, 0, 0, 1);
    matrix3.multiply(b, a, b); // Multiply a by b and store the result in b
    expect(b.m[0]).toBe(2); // a[0][0] = 2
    expect(b.m[4]).toBe(2); // d[1][1] = 2
    expect(b.m[2]).toBe(6); // tx = b[0][2] = 6
    expect(b.m[5]).toBe(8); // ty = b[1][2] = 8
  });

  it('should multiply identity correctly', () => {
    const a = matrix3.create();
    const b = matrix3.create(2, 3, 4, 5, 6, 7);
    const out = matrix3.create();
    matrix3.multiply(out, a, b);
    expect(matrix3.equals(out, b)).toBe(true);
  });

  it('should allow matrix-like objects', () => {
    const a = { m: new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 1]) };
    const b = { m: new Float32Array([1, 0, 5, 0, 1, 5, 0, 0, 1]) };
    matrix3.multiply(a, a, b);
    expect(a.m[2]).toBe(10);
    expect(a.m[5]).toBe(10);
  });
});

describe('rotate', () => {
  it('should rotate the matrix correctly', () => {
    const m = matrix3.create(1, 0, 0, 0, 1, 0, 0, 0, 1);
    const out = matrix3.create();
    matrix3.rotate(out, m, Math.PI / 2); // 90 degrees
    expect(out.m[0]).toBeCloseTo(0);
    expect(out.m[1]).toBeCloseTo(-1);
    expect(out.m[3]).toBeCloseTo(1);
    expect(out.m[4]).toBeCloseTo(0);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };

    // Apply 90 degrees rotation (π/2 radians)
    matrix3.rotate(out, m, Math.PI / 2);

    // Check that the resulting matrix corresponds to a 90-degree rotation matrix
    expect(out.m[0]).toBeCloseTo(0); // a = cos(π/2) = 0
    expect(out.m[1]).toBeCloseTo(-1); // b = -sin(π/2) = -1
    expect(out.m[3]).toBeCloseTo(1); // c = sin(π/2) = 1
    expect(out.m[4]).toBeCloseTo(0); // d = cos(π/2) = 0
  });
});

describe('scale', () => {
  it('should scale the matrix correctly', () => {
    const m = matrix3.create();
    const out = matrix3.create();
    matrix3.scale(out, m, 2, 3);
    expect(out.m[0]).toBe(2);
    expect(out.m[4]).toBe(3);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = matrix3.create();
    matrix3.scale(out, m, 2, 3);
    expect(out.m[0]).toBe(2); // a
    expect(out.m[4]).toBe(3); // d
  });
});

describe('translate', () => {
  it('should translate the matrix correctly', () => {
    const m = matrix3.create();
    const out = matrix3.create();
    matrix3.translate(out, m, 2, 3);
    expect(out.m[2]).toBe(2);
    expect(out.m[5]).toBe(3);
  });

  it('should allow a matrix-like object', () => {
    const m = { m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) };
    const out = matrix3.create();
    matrix3.translate(out, m, 2, 3);
    expect(out.m[2]).toBe(2); // tx
    expect(out.m[5]).toBe(3); // ty
  });
});
