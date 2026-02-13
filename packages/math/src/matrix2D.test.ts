import type { Matrix2D, Matrix3, Matrix4 } from '@flighthq/types';

import * as matrix2D from './matrix2D.js';
import * as rectangle from './rectangle.js';
import * as vector2 from './vector2.js';
import * as vector3 from './vector3.js';

describe('create', () => {
  it('should initialize matrix with provided values', () => {
    const m = matrix2D.create(2, 3, 4, 5, 6, 7);
    expect(m.a).toBe(2);
    expect(m.b).toBe(3);
    expect(m.c).toBe(4);
    expect(m.d).toBe(5);
    expect(m.tx).toBe(6);
    expect(m.ty).toBe(7);
  });

  it('should default to identity matrix when no values are provided', () => {
    const m = matrix2D.create();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });
});

// Properties

describe('a', () => {
  it('should have default value of 1', () => {
    const m = matrix2D.create();
    expect(m.a).toBe(1);
  });
});

describe('b', () => {
  it('should have default value of 0', () => {
    const m = matrix2D.create();
    expect(m.b).toBe(0);
  });
});

describe('c', () => {
  it('should have default value of 0', () => {
    const m = matrix2D.create();
    expect(m.c).toBe(0);
  });
});

describe('d', () => {
  it('should have default value of 1', () => {
    const m = matrix2D.create();
    expect(m.d).toBe(1);
  });
});

describe('tx', () => {
  it('should have default value of 0', () => {
    const m = matrix2D.create();
    expect(m.tx).toBe(0);
  });
});

describe('ty', () => {
  it('should have default value of 0', () => {
    const m = matrix2D.create();
    expect(m.ty).toBe(0);
  });
});

describe('clone', () => {
  it('should clone the matrix correctly', () => {
    const m1 = matrix2D.create(2, 3, 4, 5, 6, 7);
    const m2 = matrix2D.clone(m1);
    expect(m2.a).toBe(2);
    expect(m2.b).toBe(3);
    expect(m2.c).toBe(4);
    expect(m2.d).toBe(5);
    expect(m2.tx).toBe(6);
    expect(m2.ty).toBe(7);
  });
});

describe('concat', () => {
  it('should support out === a', () => {
    const a = matrix2D.create(2, 0, 0, 2, 0, 0);
    const b = matrix2D.create(1, 0, 0, 1, 5, 5);
    matrix2D.concat(a, a, b);
    expect(a.tx).toBe(5);
    expect(a.ty).toBe(5);
  });

  it('should support out === b', () => {
    const a = matrix2D.create(2, 0, 0, 2, 0, 0);
    const b = matrix2D.create(1, 0, 0, 1, 3, 4);
    matrix2D.concat(b, a, b);
    expect(b.a).toBe(2);
    expect(b.d).toBe(2);
    expect(b.tx).toBe(3);
    expect(b.ty).toBe(4);
  });

  it('should concat identity correctly', () => {
    const a = matrix2D.create();
    const b = matrix2D.create(2, 3, 4, 5, 6, 7);
    const out = matrix2D.create();
    matrix2D.concat(out, a, b);
    expect(matrix2D.equals(out, b)).toBe(true);
  });

  it('should handle negative scale factors', () => {
    const m1 = matrix2D.create(2, 0, 0, 2, 0, 0);
    const m2 = matrix2D.create(-1, 0, 0, -1, 0, 0);
    matrix2D.concat(m1, m1, m2);
    expect(m1.a).toBe(-2);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(-2);
    expect(m1.tx).toBe(0);
    expect(m1.ty).toBe(0);
  });

  it('should handle translation after scaling', () => {
    const m1 = matrix2D.create(2, 0, 0, 2, 0, 0); // Scale
    const m2 = matrix2D.create(1, 0, 0, 1, 3, 4); // Translate
    matrix2D.concat(m1, m1, m2);
    expect(m1.a).toBe(2);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(2);
    expect(m1.tx).toBe(3);
    expect(m1.ty).toBe(4);
  });

  it('should handle rotation transformation', () => {
    const m1 = matrix2D.create(1, 0, 0, 1, 0, 0); // Identity matrix
    const angle = Math.PI / 4; // 45 degrees rotation
    const m2 = matrix2D.create(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); // Rotation matrix
    matrix2D.concat(m1, m1, m2);
    expect(m1.a).toBeCloseTo(Math.cos(angle), 5);
    expect(m1.b).toBeCloseTo(Math.sin(angle), 5);
    expect(m1.c).toBeCloseTo(-Math.sin(angle), 5);
    expect(m1.d).toBeCloseTo(Math.cos(angle), 5);
    expect(m1.tx).toBe(0);
    expect(m1.ty).toBe(0);
  });

  it('should handle concatenation with non-zero translations', () => {
    const m1 = matrix2D.create(1, 0, 0, 1, 0, 0);
    const m2 = matrix2D.create(1, 0, 0, 1, 5, 5);
    matrix2D.concat(m1, m1, m2);
    expect(m1.a).toBe(1);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(1);
    expect(m1.tx).toBe(5);
    expect(m1.ty).toBe(5);
  });

  it('should handle non-uniform scaling', () => {
    const m1 = matrix2D.create(1, 0, 0, 2, 0, 0); // Scaling by 2 along Y-axis
    const m2 = matrix2D.create(2, 0, 0, 1, 0, 0); // Scaling by 2 along X-axis
    matrix2D.concat(m1, m1, m2);
    expect(m1.a).toBe(2);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(2);
    expect(m1.tx).toBe(0);
    expect(m1.ty).toBe(0);
  });

  it('should handle non-zero initial tx and ty values', () => {
    const m1 = matrix2D.create(1, 0, 0, 1, 1, 1); // Translation by (1, 1)
    const m2 = matrix2D.create(1, 0, 0, 1, 2, 3); // Translation by (2, 3)
    matrix2D.concat(m1, m1, m2);
    expect(m1.tx).toBe(3); // 1 + 2
    expect(m1.ty).toBe(4); // 1 + 3
  });

  it('should handle inverse matrix multiplication', () => {
    const m1 = matrix2D.create(2, 0, 0, 2, 3, 4); // Scale by 2 and translate by (3, 4)
    const m2 = matrix2D.create(0.5, 0, 0, 0.5, -3, -4); // Inverse of m1
    matrix2D.concat(m1, m1, m2); // Concatenate m1 with its inverse

    // The result should be the identity matrix with translation adjustments
    expect(m1.a).toBe(1); // The scaling should be undone, so a = 1
    expect(m1.b).toBe(0); // No shear, so b = 0
    expect(m1.c).toBe(0); // No shear, so c = 0
    expect(m1.d).toBe(1); // The scaling should be undone, so d = 1
    expect(m1.tx).toBe(-1.5); // The translation is undone, resulting in tx = -1.5
    expect(m1.ty).toBe(-2); // The translation is undone, resulting in ty = -2
  });

  it('should handle concatenation with a matrix that has negative values', () => {
    const m1 = matrix2D.create(1, 0, 0, 1, 0, 0);
    const m2 = matrix2D.create(-1, 0, 0, -1, -2, -3); // Negative scale and translation
    matrix2D.concat(m1, m1, m2);
    expect(m1.a).toBe(-1);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(-1);
    expect(m1.tx).toBe(-2);
    expect(m1.ty).toBe(-3);
  });
});

describe('copy', () => {
  it('should copy matrix values from another matrix', () => {
    const m1 = matrix2D.create(2, 3, 4, 5, 6, 7);
    const m2 = matrix2D.create();
    matrix2D.copy(m2, m1);
    expect(m2.a).toBe(2);
    expect(m2.b).toBe(3);
    expect(m2.c).toBe(4);
    expect(m2.d).toBe(5);
    expect(m2.tx).toBe(6);
    expect(m2.ty).toBe(7);
  });
});

describe('copyColumnFrom', () => {
  it('should copy column from a vector3 to a matrix2D', () => {
    const m = matrix2D.create();
    const v = vector3.create(1, 2, 0);
    matrix2D.copyColumnFrom(m, 0, v); // column 0
    expect(m.a).toBe(1);
    expect(m.b).toBe(2);
  });

  it('should copy column 1 (c, d)', () => {
    const m = matrix2D.create();
    const v = vector3.create(3, 4, 0);
    matrix2D.copyColumnFrom(m, 1, v);
    expect(m.c).toBe(3);
    expect(m.d).toBe(4);
  });

  it('should copy column 2 (tx, ty)', () => {
    const m = matrix2D.create();
    const v = vector3.create(5, 6, 0);
    matrix2D.copyColumnFrom(m, 2, v);
    expect(m.tx).toBe(5);
    expect(m.ty).toBe(6);
  });

  it('should throw when column is greater than 2', () => {
    const m = matrix2D.create();
    const v = vector3.create();
    expect(() => matrix2D.copyColumnFrom(m, 3, v)).toThrow();
  });
});

describe('copyColumnTo', () => {
  it('should copy column to a vector3 from a matrix2D', () => {
    const m = matrix2D.create(1, 2, 3, 4, 5, 6);
    const v = vector3.create();
    matrix2D.copyColumnTo(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(0);
  });

  it('should copy column 1 into vector3', () => {
    const m = matrix2D.create(0, 0, 3, 4, 0, 0);
    const v = vector3.create();
    matrix2D.copyColumnTo(v, 1, m);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
    expect(v.z).toBe(0);
  });

  it('should copy column 2 into vector3 and set z to 1', () => {
    const m = matrix2D.create(0, 0, 0, 0, 7, 8);
    const v = vector3.create();
    matrix2D.copyColumnTo(v, 2, m);
    expect(v.x).toBe(7);
    expect(v.y).toBe(8);
    expect(v.z).toBe(1);
  });

  it('should throw when column is greater than 2', () => {
    const m = matrix2D.create();
    const v = vector3.create();
    expect(() => matrix2D.copyColumnTo(v, 3, m)).toThrow();
  });
});

describe('copyRowFrom', () => {
  it('should copy row from a vector3 to a matrix2D', () => {
    const m = matrix2D.create();
    const v = vector3.create(1, 2, 3);
    matrix2D.copyRowFrom(m, 0, v); // row 0
    expect(m.a).toBe(1);
    expect(m.c).toBe(2);
    expect(m.tx).toBe(3);
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = matrix2D.create();
    const v = vector3.create(2, 4, 6);
    matrix2D.copyRowFrom(m, 1, v);
    expect(m.b).toBe(2);
    expect(m.d).toBe(4);
    expect(m.ty).toBe(6);
  });

  it('should throw when row is greater than 2', () => {
    const m = matrix2D.create();
    const v = vector3.create();
    expect(() => matrix2D.copyRowFrom(m, 3, v)).toThrow();
  });
});

describe('copyRowTo', () => {
  it('should copy row to a vector3 from a matrix2D', () => {
    const m = matrix2D.create(1, 2, 3, 4, 5, 6);
    const v = vector3.create();
    matrix2D.copyRowTo(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(3); // m.c
    expect(v.z).toBe(5); // m.tx
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = matrix2D.create(1, 2, 3, 4, 5, 6);
    const v = vector3.create();
    matrix2D.copyRowTo(v, 1, m);
    expect(v.x).toBe(2);
    expect(v.y).toBe(4);
    expect(v.z).toBe(6);
  });

  it('should return (0, 0, 1) for row 2', () => {
    const m = matrix2D.create();
    const v = vector3.create();
    matrix2D.copyRowTo(v, 2, m);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(1);
  });
});

describe('createTransform', () => {
  it('should create a matrix2D.create and call setTransform', () => {
    const m1 = matrix2D.createTransform(2, 4, 45, 10, 100);
    const m2 = matrix2D.create();
    matrix2D.setTransform(m2, 2, 4, 45, 10, 100);
    expect(matrix2D.equals(m1, m2)).toBe(true);
  });
});

describe('equals', () => {
  it('should return false if one matrix is null and the other is not', () => {
    const mat1 = matrix2D.create();
    expect(matrix2D.equals(mat1, null)).toBe(false);
  });

  it('should return false if one matrix is undefined and the other is not', () => {
    const mat1 = matrix2D.create();
    expect(matrix2D.equals(mat1, undefined)).toBe(false);
  });

  it('should return true if both matrix objects are null', () => {
    expect(matrix2D.equals(null, null)).toBe(true);
  });

  it('should return true if both matrix objects are undefined', () => {
    expect(matrix2D.equals(undefined, undefined)).toBe(true);
  });

  it('should return true if one matrix object is undefined and the other is null', () => {
    expect(matrix2D.equals(undefined, undefined)).toBe(true);
  });

  it('should return false if both matrix objects are defined and have different values', () => {
    const mat1 = matrix2D.create();
    const mat2 = matrix2D.create();
    mat2.a = 2;
    expect(matrix2D.equals(mat1, mat2)).toBe(false);
  });

  it('should allow differences in translation if includeTranslation is false', () => {
    const mat1 = matrix2D.create();
    const mat2 = matrix2D.create();
    mat2.tx = 100;
    expect(matrix2D.equals(mat1, mat2, false)).toBe(true);
  });

  it('should not allow differences in translation if includeTranslation is true', () => {
    const mat1 = matrix2D.create();
    const mat2 = matrix2D.create();
    mat2.tx = 100;
    expect(matrix2D.equals(mat1, mat2, true)).toBe(false);
  });
});

describe('fromMatrix3', () => {
  let mat3: Matrix3;
  let mat2D: Matrix2D;

  beforeEach(() => {
    // Setup a basic Matrix3 instance for testing
    mat3 = {
      m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), // 3x3 matrix (row-major)
    };
    mat2D = matrix2D.create(); // Create a matrix2D.create instance
  });

  it('should correctly copy the first 6 values of Matrix3 into matrix2D', () => {
    matrix2D.fromMatrix3(mat2D, mat3);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(2);
    expect(mat2D.tx).toEqual(3);
    expect(mat2D.c).toEqual(4);
    expect(mat2D.d).toEqual(5);
    expect(mat2D.ty).toEqual(6);
  });

  it('should not affect the original Matrix3 after calling fromMatrix3', () => {
    const originalMatrix3 = new Float32Array(mat3.m); // Clone the original Matrix3

    matrix2D.fromMatrix3(mat2D, mat3);

    // Assert that the original Matrix3 is untouched
    expect(mat3.m).toEqual(originalMatrix3);
  });

  it('should work with matrices where all values are zeros', () => {
    const zeroMatrix3: Matrix3 = {
      m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), // A matrix full of zeros
    };

    matrix2D.fromMatrix3(mat2D, zeroMatrix3);

    expect(mat2D.a).toEqual(0);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(0);
    expect(mat2D.ty).toEqual(0);
  });

  it('should handle matrices where the translation is zero', () => {
    const translationZeroMatrix: Matrix3 = {
      m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), // Identity matrix (no translation)
    };

    matrix2D.fromMatrix3(mat2D, translationZeroMatrix);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(1);
    expect(mat2D.ty).toEqual(0);
  });
});

describe('fromMatrix4', () => {
  let mat4: Matrix4;
  let mat2D: Matrix2D;

  beforeEach(() => {
    // Setup a basic Matrix4 instance for testing (column-major)
    mat4 = {
      m: new Float32Array([1, 4, 0, 0, 2, 5, 0, 0, 0, 0, 1, 0, 3, 6, 0, 1]), // 4x4 column-major matrix
    };
    mat2D = matrix2D.create(); // Create a matrix2D.create instance
  });

  it('should correctly copy the 2D affine part from a column-major Matrix4', () => {
    matrix2D.fromMatrix4(mat2D, mat4);

    // Expected 2D affine matrix values from Matrix4 (ignoring 3rd row/column)
    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(2);
    expect(mat2D.tx).toEqual(3);
    expect(mat2D.c).toEqual(4);
    expect(mat2D.d).toEqual(5);
    expect(mat2D.ty).toEqual(6);
  });

  it('should not affect the original Matrix4 after calling fromMatrix4', () => {
    const originalMatrix4 = new Float32Array(mat4.m); // Clone the original Matrix4

    matrix2D.fromMatrix4(mat2D, mat4);

    // Assert that the original Matrix4 is untouched
    expect(mat4.m).toEqual(originalMatrix4);
  });

  it('should handle matrices with zero values correctly', () => {
    const zeroMatrix4: Matrix4 = {
      m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), // Identity matrix with no scaling or translation
    };

    matrix2D.fromMatrix4(mat2D, zeroMatrix4);

    expect(mat2D.a).toEqual(0);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(0);
    expect(mat2D.ty).toEqual(0);
  });

  it('should correctly handle a 2D identity matrix in Matrix4 format', () => {
    const identityMatrix4: Matrix4 = {
      m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), // 4x4 identity matrix (no scaling, no translation)
    };

    matrix2D.fromMatrix4(mat2D, identityMatrix4);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(1);
    expect(mat2D.ty).toEqual(0);
  });
});

describe('inverse', () => {
  it('should invert the matrix correctly', () => {
    // Create a matrix with scaling of 2 and translation of (5, 3)
    const m = matrix2D.create(2, 0, 0, 2, 5, 3);

    // Apply inversion
    let out = matrix2D.create();
    matrix2D.inverse(out, m);

    // Expected inverse matrix:
    // Scaling should be 0.5 (inverse of 2)
    // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

    // Assert the inverse matrix values
    expect(out.a).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.b).toBeCloseTo(0); // No shear on x
    expect(out.c).toBeCloseTo(0); // No shear on y
    expect(out.d).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.tx).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.ty).toBeCloseTo(-1.5); // Inverse translation on y
  });

  it('should not depend on initial out matrix values', () => {
    const source = matrix2D.create(2, 1, 3, 4, 5, 6);
    const out = matrix2D.create(9, 9, 9, 9, 9, 9);

    matrix2D.inverse(out, source);

    const result = matrix2D.create();
    matrix2D.multiply(result, source, out);

    expect(result.a).toBeCloseTo(1);
    expect(result.b).toBeCloseTo(0);
    expect(result.c).toBeCloseTo(0);
    expect(result.d).toBeCloseTo(1);
  });
});

describe('inverseTransformPoint', () => {
  it('should apply inverse transformation to a point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(2, 2);
    const transformedvector2 = vector2.create();
    matrix2D.inverseTransformPoint(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should return a new point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(2, 2);
    const transformedvector2 = vector2.create();
    matrix2D.inverseTransformPoint(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify original point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(2, 2);
    const out = vector2.create();
    matrix2D.inverseTransformPoint(out, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(2);
  });
});

describe('inverseTransformPointXY', () => {
  it('should apply inverse transformation to a point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    let transformedvector2 = vector2.create();
    matrix2D.inverseTransformPointXY(transformedvector2, m, 2, 2);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should handle singular matrices', () => {
    const m = matrix2D.create(1, 2, 2, 4, 10, 20); // determinant = 0
    const out = vector2.create();

    matrix2D.inverseTransformPointXY(out, m, 5, 5);

    expect(out.x).toBe(-10);
    expect(out.y).toBe(-20);
  });
});

describe('inverseTransformVector', () => {
  it('should apply inverse transformation to a point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(2, 2);
    const transformedvector2 = vector2.create();
    matrix2D.inverseTransformVector(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should return a new point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(2, 2);
    const transformedvector2 = vector2.create();
    matrix2D.inverseTransformVector(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify original point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(2, 2);
    const out = vector2.create();
    matrix2D.inverseTransformVector(out, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(2);
  });
});

describe('inverseTransformVectorXY', () => {
  it('should apply inverse transformation to a point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    let transformedvector2 = vector2.create();
    matrix2D.inverseTransformVectorXY(transformedvector2, m, 2, 2);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should handle singular matrices', () => {
    const m = matrix2D.create(1, 2, 2, 4, 10, 20); // determinant = 0
    const out = vector2.create();

    matrix2D.inverseTransformVectorXY(out, m, 5, 5);

    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('multiply', () => {
  it('should support out === a', () => {
    const a = matrix2D.create(2, 0, 0, 2, 1, 1);
    const b = matrix2D.create(1, 0, 0, 1, 5, 6);

    // out = a × b
    matrix2D.multiply(a, a, b);

    // translation = A.linear × B.translation + A.translation
    expect(a.tx).toBe(2 * 5 + 1); // 11
    expect(a.ty).toBe(2 * 6 + 1); // 13
  });

  it('should support out === b', () => {
    const a = matrix2D.create(2, 0, 0, 2, 0, 0);
    const b = matrix2D.create(1, 0, 0, 1, 3, 4);

    matrix2D.multiply(b, a, b);

    expect(b.a).toBe(2);
    expect(b.d).toBe(2);
    expect(b.tx).toBe(6); // 2 * 3
    expect(b.ty).toBe(8); // 2 * 4
  });

  it('should multiply identity correctly', () => {
    const identity = matrix2D.create();
    const m = matrix2D.create(2, 3, 4, 5, 6, 7);
    const out = matrix2D.create();

    matrix2D.multiply(out, identity, m);
    expect(matrix2D.equals(out, m)).toBe(true);

    matrix2D.multiply(out, m, identity);
    expect(matrix2D.equals(out, m)).toBe(true);
  });

  it('should handle negative scale factors', () => {
    const m1 = matrix2D.create(2, 0, 0, 2, 0, 0);
    const m2 = matrix2D.create(-1, 0, 0, -1, 0, 0);

    const out = matrix2D.create();
    matrix2D.multiply(out, m1, m2);

    expect(out.a).toBe(-2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(-2);
    expect(out.tx).toBe(0);
    expect(out.ty).toBe(0);
  });

  it('should handle rotation multiplication', () => {
    const angle = Math.PI / 4;
    const r = matrix2D.create(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0);

    const out = matrix2D.create();
    matrix2D.multiply(out, r, r); // r² = rotation by 90°

    expect(out.a).toBeCloseTo(0, 5);
    expect(out.b).toBeCloseTo(1, 5);
    expect(out.c).toBeCloseTo(-1, 5);
    expect(out.d).toBeCloseTo(0, 5);
  });

  it('should handle non-uniform scaling', () => {
    const scaleY = matrix2D.create(1, 0, 0, 2, 0, 0);
    const scaleX = matrix2D.create(2, 0, 0, 1, 0, 0);

    const out = matrix2D.create();
    matrix2D.multiply(out, scaleY, scaleX);

    expect(out.a).toBe(2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(2);
  });

  it('should handle translation correctly', () => {
    const a = matrix2D.create(2, 0, 0, 2, 1, 1);
    const b = matrix2D.create(1, 0, 0, 1, 3, 4);

    const out = matrix2D.create();
    matrix2D.multiply(out, a, b);

    // t' = A.linear × B.translation + A.translation
    expect(out.tx).toBe(2 * 3 + 1); // 7
    expect(out.ty).toBe(2 * 4 + 1); // 9
  });

  it('should handle negative values consistently', () => {
    const a = matrix2D.create(-1, 0, 0, -1, 0, 0);
    const b = matrix2D.create(1, 0, 0, 1, -2, -3);

    const out = matrix2D.create();
    matrix2D.multiply(out, a, b);

    expect(out.tx).toBe(2);
    expect(out.ty).toBe(3);
  });
});

describe('rotate', () => {
  it('should write rotated result to out without modifying source', () => {
    const src = matrix2D.create(1, 0, 0, 1, 10, 0);
    const out = matrix2D.create();
    matrix2D.rotate(out, src, Math.PI / 2);
    expect(src.tx).toBe(10);
    expect(out.tx).toBeCloseTo(0);
  });

  it('should support out === source', () => {
    const m = matrix2D.create(1, 0, 0, 1, 0, 0);
    matrix2D.rotate(m, m, Math.PI);
    expect(m.a).toBeCloseTo(-1);
    expect(m.d).toBeCloseTo(-1);
  });
});

describe('scale', () => {
  it('should write scaled result to out without modifying source', () => {
    const src = matrix2D.create(2, 0, 0, 2, 5, 6);
    const out = matrix2D.create();
    matrix2D.scale(out, src, 2, 3);
    expect(src.a).toBe(2);
    expect(out.a).toBe(4);
    expect(out.d).toBe(6);
  });

  it('should support out === source', () => {
    const m = matrix2D.create(1, 0, 0, 1, 1, 1);
    matrix2D.scale(m, m, 2, 3);
    expect(m.a).toBe(2);
    expect(m.d).toBe(3);
    expect(m.tx).toBe(2);
    expect(m.ty).toBe(3);
  });
});

describe('setTo', () => {
  it('should assign all matrix fields', () => {
    const m = matrix2D.create();
    matrix2D.setTo(m, 1, 2, 3, 4, 5, 6);
    expect(m.a).toBe(1);
    expect(m.b).toBe(2);
    expect(m.c).toBe(3);
    expect(m.d).toBe(4);
    expect(m.tx).toBe(5);
    expect(m.ty).toBe(6);
  });
});

describe('setTransform', () => {
  it('should apply rotate, scale and translation', () => {
    const m1 = matrix2D.create();
    matrix2D.rotate(m1, m1, 45);
    matrix2D.scale(m1, m1, 2, 4);
    matrix2D.translate(m1, m1, 10, 100);
    const m2 = matrix2D.create();
    matrix2D.setTransform(m2, 2, 4, 45, 10, 100);
    expect(matrix2D.equals(m1, m2)).toBe(true);
  });
});

describe('transformPoint', () => {
  it('should transform a point using the matrix', () => {
    const m = matrix2D.create(1, 0, 0, 1, 10, 20);
    const p = vector2.create(1, 1);
    const transformedvector2 = vector2.create();
    matrix2D.transformPoint(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(11);
    expect(transformedvector2.y).toBe(21);
  });

  it('should not return same point', () => {
    const m = matrix2D.create(1, 0, 0, 1, 10, 20);
    const p = vector2.create(1, 1);
    const transformedvector2 = vector2.create();
    matrix2D.transformPoint(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify input point', () => {
    const m = matrix2D.create(1, 0, 0, 1, 10, 20);
    const p = vector2.create(1, 1);
    const out = vector2.create();
    matrix2D.transformPoint(out, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
  });
});

describe('transformPointXY', () => {
  it('should correctly transform coordinates with translation', () => {
    const m = matrix2D.create(1, 0, 0, 1, 5, 6);
    const p = vector2.create();
    matrix2D.transformPointXY(p, m, 1, 2);
    expect(p.x).toBe(6);
    expect(p.y).toBe(8);
  });

  it('should handle rotation correctly', () => {
    const m = matrix2D.create();
    matrix2D.rotate(m, m, Math.PI / 2);
    const p = vector2.create();
    matrix2D.transformPointXY(p, m, 1, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});

describe('transformRect', () => {
  it('should return the same rectangle for identity matrix', () => {
    const rect = rectangle.create(0, 0, 10, 20);
    const matrix = matrix2D.create(); // identity by default
    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should apply translation correctly', () => {
    const rect = rectangle.create(0, 0, 10, 20);
    const matrix = matrix2D.create();
    matrix.tx = 5;
    matrix.ty = 7;
    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(7);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should apply uniform scaling correctly', () => {
    const rect = rectangle.create(0, 0, 10, 20);
    const matrix = matrix2D.create();
    matrix.a = 2; // scaleX
    matrix.d = 3; // scaleY
    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(60);
  });

  it('should handle rotation correctly', () => {
    const rect = rectangle.create(0, 0, 10, 20);
    const matrix = matrix2D.create();
    const angle = Math.PI / 2; // 90 degrees
    matrix.a = Math.cos(angle);
    matrix.b = Math.sin(angle);
    matrix.c = -Math.sin(angle);
    matrix.d = Math.cos(angle);

    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    // After 90° rotation, width and height swap in axis-aligned bounding box
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(10);
  });

  it('should handle skew correctly', () => {
    const rect = rectangle.create(0, 0, 10, 10);
    const matrix = matrix2D.create();
    matrix.c = 1; // skew X
    matrix.b = 0.5; // skew Y

    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    // For 10x10, transformed width and height increase due to skew
    expect(out.width).toBeCloseTo(10 + 10 * 1); // 20
    expect(out.height).toBeCloseTo(10 + 10 * 0.5); // 15
  });

  it('should not return same object', () => {
    const rect = rectangle.create(0, 0, 10, 10);
    const matrix = matrix2D.create();
    matrix.tx = 5;
    matrix.ty = 7;

    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    expect(rect).not.toBe(out);
  });

  it('should not modify input object', () => {
    const rect = rectangle.create(0, 0, 10, 10);
    const matrix = matrix2D.create();
    matrix.tx = 5;
    matrix.ty = 7;

    const out = rectangle.create();
    matrix2D.transformRect(out, matrix, rect);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(10);
    expect(rect.height).toBeCloseTo(10);
  });
});

describe('transformRectVec2', () => {
  it('should alias transformRectXY', () => {
    const m = matrix2D.create();
    const out = rectangle.create();
    const a = vector2.create(10, 10);
    const b = vector2.create();
    matrix2D.transformRectVec2(out, m, a, b);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });
});

describe('transformRectXY', () => {
  it('should work when ax > bx or ay > by (flipped input)', () => {
    const m = matrix2D.create();
    const out = rectangle.create();
    matrix2D.transformRectXY(out, m, 10, 10, 0, 0);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('should handle negative scaling', () => {
    const m = matrix2D.create(-1, 0, 0, -1, 0, 0);
    const out = rectangle.create();
    matrix2D.transformRectXY(out, m, 0, 0, 10, 10);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('should handle rotation', () => {
    const m = matrix2D.create();
    matrix2D.rotate(m, m, Math.PI / 2);
    const out = rectangle.create();
    matrix2D.transformRectXY(out, m, 0, 0, 10, 20);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(10);
  });

  it('should handle flipped input coordinates', () => {
    const rect = rectangle.create(10, 20, -10, -20);
    const matrix = matrix2D.create();

    const out = rectangle.create();
    matrix2D.transformRectXY(out, matrix, rect.x, rect.y, rectangle.right(rect), rectangle.bottom(rect));

    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should handle negative scaling (mirroring)', () => {
    const rect = rectangle.create(0, 0, 10, 20);
    const matrix = matrix2D.create(-1, 0, 0, -1, 0, 0);

    const out = rectangle.create();
    matrix2D.transformRectXY(out, matrix, rect.x, rect.y, rectangle.right(rect), rectangle.bottom(rect));

    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });
});

describe('transformVector', () => {
  it('should apply delta transformation to a point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(1, 1);
    const transformedvector2 = vector2.create();
    matrix2D.transformVector(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(2);
    expect(transformedvector2.y).toBe(2);
  });

  it('should not modify input point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const p = vector2.create(1, 1);
    const out = vector2.create();
    matrix2D.transformVector(out, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
  });
});

describe('transformVectorXY', () => {
  it('should apply delta transformation to a point', () => {
    const m = matrix2D.create(2, 0, 0, 2, 0, 0);
    const transformedvector2 = vector2.create();
    matrix2D.transformVectorXY(transformedvector2, m, 1, 1);
    expect(transformedvector2.x).toBe(2);
    expect(transformedvector2.y).toBe(2);
  });
});

describe('translate', () => {
  it('should translate the matrix correctly', () => {
    const m = matrix2D.create();
    matrix2D.translate(m, m, 10, 20);
    expect(m.tx).toBe(10);
    expect(m.ty).toBe(20);
  });
});
