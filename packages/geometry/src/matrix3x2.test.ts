import {
  createMatrix3x2,
  createMatrix3x2GradientTransform,
  createMatrix3x2Transform,
  createRectangle,
  createVector2,
  createVector3,
  mat3x2Clone,
  mat3x2Concat,
  mat3x2Copy,
  mat3x2CopyColumnFrom,
  mat3x2CopyColumnTo,
  mat3x2CopyRowFrom,
  mat3x2CopyRowTo,
  mat3x2Equals,
  mat3x2FromFloat32Array,
  mat3x2FromMat3x3,
  mat3x2FromMat4x4,
  mat3x2Identity,
  mat3x2Inverse,
  mat3x2InverseTransformPoint,
  mat3x2InverseTransformPointXY,
  mat3x2InverseTransformVector,
  mat3x2InverseTransformVectorXY,
  mat3x2Multiply,
  mat3x2Rotate,
  mat3x2Scale,
  mat3x2SetGradientTransform,
  mat3x2SetTo,
  mat3x2SetTransform,
  mat3x2TransformPoint,
  mat3x2TransformPointXY,
  mat3x2TransformRect,
  mat3x2TransformRectVec2,
  mat3x2TransformRectXY,
  mat3x2TransformVector,
  mat3x2TransformVectorXY,
  mat3x2Translate,
  mat3x2TranslateUsingVector,
  mat3x2TranslateUsingVectorXY,
  mat3x2WriteToFloat32Array,
  rectBottom,
  rectRight,
} from '@flighthq/geometry';
import type { Matrix3x2, Matrix3x3Like, Matrix4x4Like } from '@flighthq/types';

describe('create', () => {
  it('should initialize matrix3x2 with provided values', () => {
    const m = createMatrix3x2(2, 3, 4, 5, 6, 7);
    expect(m.a).toBe(2);
    expect(m.b).toBe(3);
    expect(m.c).toBe(4);
    expect(m.d).toBe(5);
    expect(m.tx).toBe(6);
    expect(m.ty).toBe(7);
  });

  it('should default to identity matrix3x2 when no values are provided', () => {
    const m = createMatrix3x2();
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
    const m = createMatrix3x2();
    expect(m.a).toBe(1);
  });
});

describe('b', () => {
  it('should have default value of 0', () => {
    const m = createMatrix3x2();
    expect(m.b).toBe(0);
  });
});

describe('c', () => {
  it('should have default value of 0', () => {
    const m = createMatrix3x2();
    expect(m.c).toBe(0);
  });
});

describe('d', () => {
  it('should have default value of 1', () => {
    const m = createMatrix3x2();
    expect(m.d).toBe(1);
  });
});

describe('tx', () => {
  it('should have default value of 0', () => {
    const m = createMatrix3x2();
    expect(m.tx).toBe(0);
  });
});

describe('ty', () => {
  it('should have default value of 0', () => {
    const m = createMatrix3x2();
    expect(m.ty).toBe(0);
  });
});

describe('clone', () => {
  it('should clone the matrix3x2 correctly', () => {
    const m1 = createMatrix3x2(2, 3, 4, 5, 6, 7);
    const m2 = mat3x2Clone(m1);
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
    const a = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const b = createMatrix3x2(1, 0, 0, 1, 5, 5);
    mat3x2Concat(a, a, b);
    expect(a.tx).toBe(5);
    expect(a.ty).toBe(5);
  });

  it('should support out === b', () => {
    const a = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const b = createMatrix3x2(1, 0, 0, 1, 3, 4);
    mat3x2Concat(b, a, b);
    expect(b.a).toBe(2);
    expect(b.d).toBe(2);
    expect(b.tx).toBe(3);
    expect(b.ty).toBe(4);
  });

  it('should concat identity correctly', () => {
    const a = createMatrix3x2();
    const b = createMatrix3x2(2, 3, 4, 5, 6, 7);
    const out = createMatrix3x2();
    mat3x2Concat(out, a, b);
    expect(mat3x2Equals(out, b)).toBe(true);
  });

  it('should handle negative scale factors', () => {
    const m1 = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const m2 = createMatrix3x2(-1, 0, 0, -1, 0, 0);
    mat3x2Concat(m1, m1, m2);
    expect(m1.a).toBe(-2);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(-2);
    expect(m1.tx).toBe(0);
    expect(m1.ty).toBe(0);
  });

  it('should handle translation after scaling', () => {
    const m1 = createMatrix3x2(2, 0, 0, 2, 0, 0); // Scale
    const m2 = createMatrix3x2(1, 0, 0, 1, 3, 4); // Translate
    mat3x2Concat(m1, m1, m2);
    expect(m1.a).toBe(2);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(2);
    expect(m1.tx).toBe(3);
    expect(m1.ty).toBe(4);
  });

  it('should handle rotation transformation', () => {
    const m1 = createMatrix3x2(1, 0, 0, 1, 0, 0); // Identity matrix3x2
    const angle = Math.PI / 4; // 45 degrees rotation
    const m2 = createMatrix3x2(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); // Rotation matrix3x2
    mat3x2Concat(m1, m1, m2);
    expect(m1.a).toBeCloseTo(Math.cos(angle), 5);
    expect(m1.b).toBeCloseTo(Math.sin(angle), 5);
    expect(m1.c).toBeCloseTo(-Math.sin(angle), 5);
    expect(m1.d).toBeCloseTo(Math.cos(angle), 5);
    expect(m1.tx).toBe(0);
    expect(m1.ty).toBe(0);
  });

  it('should handle concatenation with non-zero translations', () => {
    const m1 = createMatrix3x2(1, 0, 0, 1, 0, 0);
    const m2 = createMatrix3x2(1, 0, 0, 1, 5, 5);
    mat3x2Concat(m1, m1, m2);
    expect(m1.a).toBe(1);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(1);
    expect(m1.tx).toBe(5);
    expect(m1.ty).toBe(5);
  });

  it('should handle non-uniform scaling', () => {
    const m1 = createMatrix3x2(1, 0, 0, 2, 0, 0); // Scaling by 2 along Y-axis
    const m2 = createMatrix3x2(2, 0, 0, 1, 0, 0); // Scaling by 2 along X-axis
    mat3x2Concat(m1, m1, m2);
    expect(m1.a).toBe(2);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(2);
    expect(m1.tx).toBe(0);
    expect(m1.ty).toBe(0);
  });

  it('should handle non-zero initial tx and ty values', () => {
    const m1 = createMatrix3x2(1, 0, 0, 1, 1, 1); // Translation by (1, 1)
    const m2 = createMatrix3x2(1, 0, 0, 1, 2, 3); // Translation by (2, 3)
    mat3x2Concat(m1, m1, m2);
    expect(m1.tx).toBe(3); // 1 + 2
    expect(m1.ty).toBe(4); // 1 + 3
  });

  it('should handle inverse matrix3x2 multiplication', () => {
    const m1 = createMatrix3x2(2, 0, 0, 2, 3, 4); // Scale by 2 and translate by (3, 4)
    const m2 = createMatrix3x2(0.5, 0, 0, 0.5, -3, -4); // Inverse of m1
    mat3x2Concat(m1, m1, m2); // Concatenate m1 with its inverse

    // The result should be the identity matrix3x2 with translation adjustments
    expect(m1.a).toBe(1); // The scaling should be undone, so a = 1
    expect(m1.b).toBe(0); // No shear, so b = 0
    expect(m1.c).toBe(0); // No shear, so c = 0
    expect(m1.d).toBe(1); // The scaling should be undone, so d = 1
    expect(m1.tx).toBe(-1.5); // The translation is undone, resulting in tx = -1.5
    expect(m1.ty).toBe(-2); // The translation is undone, resulting in ty = -2
  });

  it('should handle concatenation with a matrix3x2 that has negative values', () => {
    const m1 = createMatrix3x2(1, 0, 0, 1, 0, 0);
    const m2 = createMatrix3x2(-1, 0, 0, -1, -2, -3); // Negative scale and translation
    mat3x2Concat(m1, m1, m2);
    expect(m1.a).toBe(-1);
    expect(m1.b).toBe(0);
    expect(m1.c).toBe(0);
    expect(m1.d).toBe(-1);
    expect(m1.tx).toBe(-2);
    expect(m1.ty).toBe(-3);
  });
});

describe('copy', () => {
  it('should copy matrix3x2 values from another matrix3x2', () => {
    const m1 = createMatrix3x2(2, 3, 4, 5, 6, 7);
    const m2 = createMatrix3x2();
    mat3x2Copy(m2, m1);
    expect(m2.a).toBe(2);
    expect(m2.b).toBe(3);
    expect(m2.c).toBe(4);
    expect(m2.d).toBe(5);
    expect(m2.tx).toBe(6);
    expect(m2.ty).toBe(7);
  });
});

describe('copyColumnFrom', () => {
  it('should copy column from a vector3 to a matrix3x2', () => {
    const m = createMatrix3x2();
    const v = createVector3(1, 2, 0);
    mat3x2CopyColumnFrom(m, 0, v); // column 0
    expect(m.a).toBe(1);
    expect(m.b).toBe(2);
  });

  it('should copy column 1 (c, d)', () => {
    const m = createMatrix3x2();
    const v = createVector3(3, 4, 0);
    mat3x2CopyColumnFrom(m, 1, v);
    expect(m.c).toBe(3);
    expect(m.d).toBe(4);
  });

  it('should copy column 2 (tx, ty)', () => {
    const m = createMatrix3x2();
    const v = createVector3(5, 6, 0);
    mat3x2CopyColumnFrom(m, 2, v);
    expect(m.tx).toBe(5);
    expect(m.ty).toBe(6);
  });

  it('should throw when column is greater than 2', () => {
    const m = createMatrix3x2();
    const v = createVector3();
    expect(() => mat3x2CopyColumnFrom(m, 3, v)).toThrow();
  });
});

describe('copyColumnTo', () => {
  it('should copy column to a vector3 from a matrix3x2', () => {
    const m = createMatrix3x2(1, 2, 3, 4, 5, 6);
    const v = createVector3();
    mat3x2CopyColumnTo(v, 0, m); // column 0
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(0);
  });

  it('should copy column 1 into vector3', () => {
    const m = createMatrix3x2(0, 0, 3, 4, 0, 0);
    const v = createVector3();
    mat3x2CopyColumnTo(v, 1, m);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
    expect(v.z).toBe(0);
  });

  it('should copy column 2 into vector3 and set z to 1', () => {
    const m = createMatrix3x2(0, 0, 0, 0, 7, 8);
    const v = createVector3();
    mat3x2CopyColumnTo(v, 2, m);
    expect(v.x).toBe(7);
    expect(v.y).toBe(8);
    expect(v.z).toBe(1);
  });

  it('should throw when column is greater than 2', () => {
    const m = createMatrix3x2();
    const v = createVector3();
    expect(() => mat3x2CopyColumnTo(v, 3, m)).toThrow();
  });
});

describe('copyRowFrom', () => {
  it('should copy row from a vector3 to a matrix3x2', () => {
    const m = createMatrix3x2();
    const v = createVector3(1, 2, 3);
    mat3x2CopyRowFrom(m, 0, v); // row 0
    expect(m.a).toBe(1);
    expect(m.c).toBe(2);
    expect(m.tx).toBe(3);
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = createMatrix3x2();
    const v = createVector3(2, 4, 6);
    mat3x2CopyRowFrom(m, 1, v);
    expect(m.b).toBe(2);
    expect(m.d).toBe(4);
    expect(m.ty).toBe(6);
  });

  it('should throw when row is greater than 2', () => {
    const m = createMatrix3x2();
    const v = createVector3();
    expect(() => mat3x2CopyRowFrom(m, 3, v)).toThrow();
  });
});

describe('copyRowTo', () => {
  it('should copy row to a vector3 from a matrix3x2', () => {
    const m = createMatrix3x2(1, 2, 3, 4, 5, 6);
    const v = createVector3();
    mat3x2CopyRowTo(v, 0, m); // row 0
    expect(v.x).toBe(1); // m.a
    expect(v.y).toBe(3); // m.c
    expect(v.z).toBe(5); // m.tx
  });

  it('should copy row 1 (b, d, ty)', () => {
    const m = createMatrix3x2(1, 2, 3, 4, 5, 6);
    const v = createVector3();
    mat3x2CopyRowTo(v, 1, m);
    expect(v.x).toBe(2);
    expect(v.y).toBe(4);
    expect(v.z).toBe(6);
  });

  it('should return (0, 0, 1) for row 2', () => {
    const m = createMatrix3x2();
    const v = createVector3();
    mat3x2CopyRowTo(v, 2, m);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(1);
  });
});

describe('createTransform', () => {
  it('should create a createMatrix3x2 and call setTransform', () => {
    const m1 = createMatrix3x2Transform(2, 4, 45, 10, 100);
    const m2 = createMatrix3x2();
    mat3x2SetTransform(m2, 2, 4, 45, 10, 100);
    expect(mat3x2Equals(m1, m2)).toBe(true);
  });
});

describe('equals', () => {
  it('should return false if one matrix3x2 is null and the other is not', () => {
    const mat1 = createMatrix3x2();
    expect(mat3x2Equals(mat1, null)).toBe(false);
  });

  it('should return false if one matrix3x2 is undefined and the other is not', () => {
    const mat1 = createMatrix3x2();
    expect(mat3x2Equals(mat1, undefined)).toBe(false);
  });

  it('should return true if both matrix3x2 objects are null', () => {
    expect(mat3x2Equals(null, null)).toBe(true);
  });

  it('should return true if both matrix3x2 objects are undefined', () => {
    expect(mat3x2Equals(undefined, undefined)).toBe(true);
  });

  it('should return true if one matrix3x2 object is undefined and the other is null', () => {
    expect(mat3x2Equals(undefined, undefined)).toBe(true);
  });

  it('should return false if both matrix3x2 objects are defined and have different values', () => {
    const mat1 = createMatrix3x2();
    const mat2 = createMatrix3x2();
    mat2.a = 2;
    expect(mat3x2Equals(mat1, mat2)).toBe(false);
  });

  it('should allow differences in translation if includeTranslation is false', () => {
    const mat1 = createMatrix3x2();
    const mat2 = createMatrix3x2();
    mat2.tx = 100;
    expect(mat3x2Equals(mat1, mat2, false)).toBe(true);
  });

  it('should not allow differences in translation if includeTranslation is true', () => {
    const mat1 = createMatrix3x2();
    const mat2 = createMatrix3x2();
    mat2.tx = 100;
    expect(mat3x2Equals(mat1, mat2, true)).toBe(false);
  });
});

describe('fromFloat32Array', () => {
  it('writes the matrix from 6 values at the offset', () => {
    const array = new Float32Array(6);
    for (let i = 0; i < 6; i++) {
      array[i] = i;
    }
    const matrix = createMatrix3x2();
    mat3x2FromFloat32Array(matrix, 0, array);
    expect(matrix.a).toBe(0);
    expect(matrix.b).toBe(1);
    expect(matrix.c).toBe(2);
    expect(matrix.d).toBe(3);
    expect(matrix.tx).toBe(4);
    expect(matrix.ty).toBe(5);
  });
});

describe('fromMatrix3x3', () => {
  let mat3: Matrix3x3Like;
  let mat2D: Matrix3x2;

  beforeEach(() => {
    // Setup a basic Matrix3x3 instance for testing
    mat3 = {
      m: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), // 3x3 matrix3x2 (row-major)
    };
    mat2D = createMatrix3x2(); // Create a createMatrix3x2 instance
  });

  it('should correctly copy the first 6 values of Matrix3x3 into matrix3x2', () => {
    mat3x2FromMat3x3(mat2D, mat3);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(2);
    expect(mat2D.tx).toEqual(3);
    expect(mat2D.c).toEqual(4);
    expect(mat2D.d).toEqual(5);
    expect(mat2D.ty).toEqual(6);
  });

  it('should not affect the original Matrix3x3 after calling fromMatrix3x3', () => {
    const originalMatrix3x3 = new Float32Array(mat3.m); // Clone the original Matrix3x3

    mat3x2FromMat3x3(mat2D, mat3);

    // Assert that the original Matrix3x3 is untouched
    expect(mat3.m).toEqual(originalMatrix3x3);
  });

  it('should work with matrices where all values are zeros', () => {
    const zeroMatrix3x3: Matrix3x3Like = {
      m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), // A matrix3x2 full of zeros
    };

    mat3x2FromMat3x3(mat2D, zeroMatrix3x3);

    expect(mat2D.a).toEqual(0);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(0);
    expect(mat2D.ty).toEqual(0);
  });

  it('should handle matrices where the translation is zero', () => {
    const translationZeromatrix3x2: Matrix3x3Like = {
      m: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), // Identity matrix3x2 (no translation)
    };

    mat3x2FromMat3x3(mat2D, translationZeromatrix3x2);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(1);
    expect(mat2D.ty).toEqual(0);
  });
});

describe('fromMatrix4x4', () => {
  let mat4: Matrix4x4Like;
  let mat2D: Matrix3x2;

  beforeEach(() => {
    // Setup a basic Matrix4x4 instance for testing (column-major)
    mat4 = {
      m: new Float32Array([1, 4, 0, 0, 2, 5, 0, 0, 0, 0, 1, 0, 3, 6, 0, 1]), // 4x4 column-major matrix3x2
    };
    mat2D = createMatrix3x2(); // Create a createMatrix3x2 instance
  });

  it('should correctly copy the 2D affine part from a column-major Matrix4x4', () => {
    mat3x2FromMat4x4(mat2D, mat4);

    // Expected 2D affine matrix3x2 values from Matrix4x4 (ignoring 3rd row/column)
    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(2);
    expect(mat2D.tx).toEqual(3);
    expect(mat2D.c).toEqual(4);
    expect(mat2D.d).toEqual(5);
    expect(mat2D.ty).toEqual(6);
  });

  it('should not affect the original Matrix4x4 after calling fromMatrix4x4', () => {
    const originalMatrix4x4 = new Float32Array(mat4.m); // Clone the original Matrix4x4

    mat3x2FromMat4x4(mat2D, mat4);

    // Assert that the original Matrix4x4 is untouched
    expect(mat4.m).toEqual(originalMatrix4x4);
  });

  it('should handle matrices with zero values correctly', () => {
    const zeroMatrix4x4: Matrix4x4Like = {
      m: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), // Identity matrix3x2 with no scaling or translation
    };

    mat3x2FromMat4x4(mat2D, zeroMatrix4x4);

    expect(mat2D.a).toEqual(0);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(0);
    expect(mat2D.ty).toEqual(0);
  });

  it('should correctly handle a 2D identity matrix3x2 in Matrix4x4 format', () => {
    const identityMatrix4x4: Matrix4x4Like = {
      m: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), // 4x4 identity matrix3x2 (no scaling, no translation)
    };

    mat3x2FromMat4x4(mat2D, identityMatrix4x4);

    expect(mat2D.a).toEqual(1);
    expect(mat2D.b).toEqual(0);
    expect(mat2D.tx).toEqual(0);
    expect(mat2D.c).toEqual(0);
    expect(mat2D.d).toEqual(1);
    expect(mat2D.ty).toEqual(0);
  });
});

describe('inverse', () => {
  it('should invert the matrix3x2 correctly', () => {
    // Create a matrix3x2 with scaling of 2 and translation of (5, 3)
    const m = createMatrix3x2(2, 0, 0, 2, 5, 3);

    // Apply inversion
    let out = createMatrix3x2();
    mat3x2Inverse(out, m);

    // Expected inverse matrix3x2:
    // Scaling should be 0.5 (inverse of 2)
    // Translation should be -2.5 (inverse of 5 scaled by 0.5) and -1.5 (inverse of 3 scaled by 0.5)

    // Assert the inverse matrix3x2 values
    expect(out.a).toBeCloseTo(0.5); // Inverse scaling on x
    expect(out.b).toBeCloseTo(0); // No shear on x
    expect(out.c).toBeCloseTo(0); // No shear on y
    expect(out.d).toBeCloseTo(0.5); // Inverse scaling on y
    expect(out.tx).toBeCloseTo(-2.5); // Inverse translation on x
    expect(out.ty).toBeCloseTo(-1.5); // Inverse translation on y
  });

  it('should not depend on initial out matrix3x2 values', () => {
    const source = createMatrix3x2(2, 1, 3, 4, 5, 6);
    const out = createMatrix3x2(9, 9, 9, 9, 9, 9);

    mat3x2Inverse(out, source);

    const result = createMatrix3x2();
    mat3x2Multiply(result, source, out);

    expect(result.a).toBeCloseTo(1);
    expect(result.b).toBeCloseTo(0);
    expect(result.c).toBeCloseTo(0);
    expect(result.d).toBeCloseTo(1);
  });
});

describe('inverseTransformPoint', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    mat3x2InverseTransformPoint(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should return a new point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    mat3x2InverseTransformPoint(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify original point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const out = createVector2();
    mat3x2InverseTransformPoint(out, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(2);
  });
});

describe('inverseTransformPointXY', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    let transformedvector2 = createVector2();
    mat3x2InverseTransformPointXY(transformedvector2, m, 2, 2);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should handle singular matrices', () => {
    const m = createMatrix3x2(1, 2, 2, 4, 10, 20); // determinant = 0
    const out = createVector2();

    mat3x2InverseTransformPointXY(out, m, 5, 5);

    expect(out.x).toBe(-10);
    expect(out.y).toBe(-20);
  });
});

describe('inverseTransformVector', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    mat3x2InverseTransformVector(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should return a new point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const transformedvector2 = createVector2();
    mat3x2InverseTransformVector(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify original point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(2, 2);
    const out = createVector2();
    mat3x2InverseTransformVector(out, m, p);
    expect(p.x).toBe(2);
    expect(p.y).toBe(2);
  });
});

describe('inverseTransformVectorXY', () => {
  it('should apply inverse transformation to a point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    let transformedvector2 = createVector2();
    mat3x2InverseTransformVectorXY(transformedvector2, m, 2, 2);
    expect(transformedvector2.x).toBe(1);
    expect(transformedvector2.y).toBe(1);
  });

  it('should handle singular matrices', () => {
    const m = createMatrix3x2(1, 2, 2, 4, 10, 20); // determinant = 0
    const out = createVector2();

    mat3x2InverseTransformVectorXY(out, m, 5, 5);

    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('multiply', () => {
  it('should support out === a', () => {
    const a = createMatrix3x2(2, 0, 0, 2, 1, 1);
    const b = createMatrix3x2(1, 0, 0, 1, 5, 6);

    // out = a × b
    mat3x2Multiply(a, a, b);

    // translation = A.linear × B.translation + A.translation
    expect(a.tx).toBe(2 * 5 + 1); // 11
    expect(a.ty).toBe(2 * 6 + 1); // 13
  });

  it('should support out === b', () => {
    const a = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const b = createMatrix3x2(1, 0, 0, 1, 3, 4);

    mat3x2Multiply(b, a, b);

    expect(b.a).toBe(2);
    expect(b.d).toBe(2);
    expect(b.tx).toBe(6); // 2 * 3
    expect(b.ty).toBe(8); // 2 * 4
  });

  it('should multiply identity correctly', () => {
    const identity = createMatrix3x2();
    const m = createMatrix3x2(2, 3, 4, 5, 6, 7);
    const out = createMatrix3x2();

    mat3x2Multiply(out, identity, m);
    expect(mat3x2Equals(out, m)).toBe(true);

    mat3x2Multiply(out, m, identity);
    expect(mat3x2Equals(out, m)).toBe(true);
  });

  it('should handle negative scale factors', () => {
    const m1 = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const m2 = createMatrix3x2(-1, 0, 0, -1, 0, 0);

    const out = createMatrix3x2();
    mat3x2Multiply(out, m1, m2);

    expect(out.a).toBe(-2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(-2);
    expect(out.tx).toBe(0);
    expect(out.ty).toBe(0);
  });

  it('should handle rotation multiplication', () => {
    const angle = Math.PI / 4;
    const r = createMatrix3x2(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0);

    const out = createMatrix3x2();
    mat3x2Multiply(out, r, r); // r² = rotation by 90°

    expect(out.a).toBeCloseTo(0, 5);
    expect(out.b).toBeCloseTo(1, 5);
    expect(out.c).toBeCloseTo(-1, 5);
    expect(out.d).toBeCloseTo(0, 5);
  });

  it('should handle non-uniform scaling', () => {
    const scaleY = createMatrix3x2(1, 0, 0, 2, 0, 0);
    const scaleX = createMatrix3x2(2, 0, 0, 1, 0, 0);

    const out = createMatrix3x2();
    mat3x2Multiply(out, scaleY, scaleX);

    expect(out.a).toBe(2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(2);
  });

  it('should handle translation correctly', () => {
    const a = createMatrix3x2(2, 0, 0, 2, 1, 1);
    const b = createMatrix3x2(1, 0, 0, 1, 3, 4);

    const out = createMatrix3x2();
    mat3x2Multiply(out, a, b);

    // t' = A.linear × B.translation + A.translation
    expect(out.tx).toBe(2 * 3 + 1); // 7
    expect(out.ty).toBe(2 * 4 + 1); // 9
  });

  it('should handle negative values consistently', () => {
    const a = createMatrix3x2(-1, 0, 0, -1, 0, 0);
    const b = createMatrix3x2(1, 0, 0, 1, -2, -3);

    const out = createMatrix3x2();
    mat3x2Multiply(out, a, b);

    expect(out.tx).toBe(2);
    expect(out.ty).toBe(3);
  });
});

describe('rotate', () => {
  it('should write rotated result to out without modifying source', () => {
    const src = createMatrix3x2(1, 0, 0, 1, 10, 0);
    const out = createMatrix3x2();
    mat3x2Rotate(out, src, Math.PI / 2);
    expect(src.tx).toBe(10);
    expect(out.tx).toBeCloseTo(0);
  });

  it('should support out === source', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 0, 0);
    mat3x2Rotate(m, m, Math.PI);
    expect(m.a).toBeCloseTo(-1);
    expect(m.d).toBeCloseTo(-1);
  });
});

describe('scale', () => {
  it('should write scaled result to out without modifying source', () => {
    const src = createMatrix3x2(2, 0, 0, 2, 5, 6);
    const out = createMatrix3x2();
    mat3x2Scale(out, src, 2, 3);
    expect(src.a).toBe(2);
    expect(out.a).toBe(4);
    expect(out.d).toBe(6);
  });

  it('should support out === source', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 1, 1);
    mat3x2Scale(m, m, 2, 3);
    expect(m.a).toBe(2);
    expect(m.d).toBe(3);
    expect(m.tx).toBe(2);
    expect(m.ty).toBe(3);
  });
});

describe('setTo', () => {
  it('should assign all matrix3x2 fields', () => {
    const m = createMatrix3x2();
    mat3x2SetTo(m, 1, 2, 3, 4, 5, 6);
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
    const m1 = createMatrix3x2();
    mat3x2Rotate(m1, m1, 45);
    mat3x2Scale(m1, m1, 2, 4);
    mat3x2Translate(m1, m1, 10, 100);
    const m2 = createMatrix3x2();
    mat3x2SetTransform(m2, 2, 4, 45, 10, 100);
    expect(mat3x2Equals(m1, m2)).toBe(true);
  });
});

describe('transformPoint', () => {
  it('should transform a point using the matrix3x2', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 10, 20);
    const p = createVector2(1, 1);
    const transformedvector2 = createVector2();
    mat3x2TransformPoint(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(11);
    expect(transformedvector2.y).toBe(21);
  });

  it('should not return same point', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 10, 20);
    const p = createVector2(1, 1);
    const transformedvector2 = createVector2();
    mat3x2TransformPoint(transformedvector2, m, p);
    expect(p).not.toBe(transformedvector2);
  });

  it('should not modify input point', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 10, 20);
    const p = createVector2(1, 1);
    const out = createVector2();
    mat3x2TransformPoint(out, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
  });
});

describe('transformPointXY', () => {
  it('should correctly transform coordinates with translation', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 5, 6);
    const p = createVector2();
    mat3x2TransformPointXY(p, m, 1, 2);
    expect(p.x).toBe(6);
    expect(p.y).toBe(8);
  });

  it('should handle rotation correctly', () => {
    const m = createMatrix3x2();
    mat3x2Rotate(m, m, Math.PI / 2);
    const p = createVector2();
    mat3x2TransformPointXY(p, m, 1, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});

describe('transformRect', () => {
  it('should return the same rectangle for identity matrix3x2', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix3x2(); // identity by default
    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should apply translation correctly', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix3x2();
    mat.tx = 5;
    mat.ty = 7;
    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(7);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should apply uniform scaling correctly', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix3x2();
    mat.a = 2; // scaleX
    mat.d = 3; // scaleY
    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(60);
  });

  it('should handle rotation correctly', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix3x2();
    const angle = Math.PI / 2; // 90 degrees
    mat.a = Math.cos(angle);
    mat.b = Math.sin(angle);
    mat.c = -Math.sin(angle);
    mat.d = Math.cos(angle);

    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    // After 90° rotation, width and height swap in axis-aligned bounding box
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(10);
  });

  it('should handle skew correctly', () => {
    const rect = createRectangle(0, 0, 10, 10);
    const mat = createMatrix3x2();
    mat.c = 1; // skew X
    mat.b = 0.5; // skew Y

    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    // For 10x10, transformed width and height increase due to skew
    expect(out.width).toBeCloseTo(10 + 10 * 1); // 20
    expect(out.height).toBeCloseTo(10 + 10 * 0.5); // 15
  });

  it('should not return same object', () => {
    const rect = createRectangle(0, 0, 10, 10);
    const mat = createMatrix3x2();
    mat.tx = 5;
    mat.ty = 7;

    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    expect(rect).not.toBe(out);
  });

  it('should not modify input object', () => {
    const rect = createRectangle(0, 0, 10, 10);
    const mat = createMatrix3x2();
    mat.tx = 5;
    mat.ty = 7;

    const out = createRectangle();
    mat3x2TransformRect(out, mat, rect);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(10);
    expect(rect.height).toBeCloseTo(10);
  });
});

describe('transformRectVec2', () => {
  it('should alias transformRectXY', () => {
    const m = createMatrix3x2();
    const out = createRectangle();
    const a = createVector2(10, 10);
    const b = createVector2();
    mat3x2TransformRectVec2(out, m, a, b);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });
});

describe('transformRectXY', () => {
  it('should work when ax > bx or ay > by (flipped input)', () => {
    const m = createMatrix3x2();
    const out = createRectangle();
    mat3x2TransformRectXY(out, m, 10, 10, 0, 0);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('should handle negative scaling', () => {
    const m = createMatrix3x2(-1, 0, 0, -1, 0, 0);
    const out = createRectangle();
    mat3x2TransformRectXY(out, m, 0, 0, 10, 10);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('should handle rotation', () => {
    const m = createMatrix3x2();
    mat3x2Rotate(m, m, Math.PI / 2);
    const out = createRectangle();
    mat3x2TransformRectXY(out, m, 0, 0, 10, 20);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(10);
  });

  it('should handle flipped input coordinates', () => {
    const rect = createRectangle(10, 20, -10, -20);
    const mat = createMatrix3x2();

    const out = createRectangle();
    mat3x2TransformRectXY(out, mat, rect.x, rect.y, rectRight(rect), rectBottom(rect));

    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });

  it('should handle negative scaling (mirroring)', () => {
    const rect = createRectangle(0, 0, 10, 20);
    const mat = createMatrix3x2(-1, 0, 0, -1, 0, 0);

    const out = createRectangle();
    mat3x2TransformRectXY(out, mat, rect.x, rect.y, rectRight(rect), rectBottom(rect));

    expect(out.width).toBeCloseTo(10);
    expect(out.height).toBeCloseTo(20);
  });
});

describe('transformVector', () => {
  it('should apply delta transformation to a point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(1, 1);
    const transformedvector2 = createVector2();
    mat3x2TransformVector(transformedvector2, m, p);
    expect(transformedvector2.x).toBe(2);
    expect(transformedvector2.y).toBe(2);
  });

  it('should not modify input point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const p = createVector2(1, 1);
    const out = createVector2();
    mat3x2TransformVector(out, m, p);
    expect(p.x).toBe(1);
    expect(p.y).toBe(1);
  });
});

describe('transformVectorXY', () => {
  it('should apply delta transformation to a point', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 0, 0);
    const transformedvector2 = createVector2();
    mat3x2TransformVectorXY(transformedvector2, m, 1, 1);
    expect(transformedvector2.x).toBe(2);
    expect(transformedvector2.y).toBe(2);
  });
});

describe('translate', () => {
  it('should translate the matrix3x2 correctly', () => {
    const m = createMatrix3x2();
    mat3x2Translate(m, m, 10, 20);
    expect(m.tx).toBe(10);
    expect(m.ty).toBe(20);
  });
});

describe('writeToFloat32Array', () => {
  it('writes 6 values at the offset', () => {
    const array = new Float32Array(6);
    const matrix = { a: 1, b: 2, c: 3, d: 4, tx: 5, ty: 6 };
    mat3x2WriteToFloat32Array(array, 0, matrix);
    for (let i = 0; i < 6; i++) {
      expect(array[i]).toBe(i + 1);
    }
  });
});

describe('createGradientTransform', () => {
  it('returns a Matrix3x2 equivalent to calling setGradientTransform', () => {
    const m1 = createMatrix3x2GradientTransform(100, 200);
    const m2 = createMatrix3x2();
    mat3x2SetGradientTransform(m2, 100, 200);
    expect(mat3x2Equals(m1, m2)).toBe(true);
  });

  it('sets tx to tx + width / 2 and ty to ty + height / 2', () => {
    const m = createMatrix3x2GradientTransform(100, 200, 0, 10, 20);
    expect(m.tx).toBeCloseTo(60); // 10 + 100/2
    expect(m.ty).toBeCloseTo(120); // 20 + 200/2
  });
});

describe('identity', () => {
  it('resets a modified matrix to identity', () => {
    const m = createMatrix3x2(2, 3, 4, 5, 6, 7);
    mat3x2Identity(m);
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });
});

describe('setGradientTransform', () => {
  it('sets a and d proportional to width and height', () => {
    const m = createMatrix3x2();
    mat3x2SetGradientTransform(m, 1638.4, 1638.4);
    expect(m.a).toBeCloseTo(1);
    expect(m.d).toBeCloseTo(1);
  });

  it('sets tx to tx + width / 2 and ty to ty + height / 2', () => {
    const m = createMatrix3x2();
    mat3x2SetGradientTransform(m, 200, 400, 0, 0, 0);
    expect(m.tx).toBeCloseTo(100);
    expect(m.ty).toBeCloseTo(200);
  });

  it('applies rotation to the linear part', () => {
    const m = createMatrix3x2();
    mat3x2SetGradientTransform(m, 1638.4, 1638.4, Math.PI / 2);
    expect(m.b).toBeCloseTo(1);
    expect(m.c).toBeCloseTo(-1);
  });
});

describe('translateUsingVector', () => {
  it('translates tx/ty by the transformed vector', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 5, 10);
    const out = createMatrix3x2();
    mat3x2TranslateUsingVector(out, m, { x: 3, y: 4 });
    expect(out.tx).toBeCloseTo(5 + 2 * 3 + 0 * 4); // 11
    expect(out.ty).toBeCloseTo(10 + 0 * 3 + 2 * 4); // 18
  });
});

describe('translateUsingVectorXY', () => {
  it('translates tx/ty by the transformed x and y components', () => {
    const m = createMatrix3x2(2, 0, 0, 2, 5, 10);
    const out = createMatrix3x2();
    mat3x2TranslateUsingVectorXY(out, m, 3, 4);
    expect(out.tx).toBeCloseTo(11);
    expect(out.ty).toBeCloseTo(18);
  });

  it('supports out === source', () => {
    const m = createMatrix3x2(1, 0, 0, 1, 5, 10);
    mat3x2TranslateUsingVectorXY(m, m, 2, 3);
    expect(m.tx).toBeCloseTo(7);
    expect(m.ty).toBeCloseTo(13);
  });
});
