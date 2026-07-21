import { createMatrix3, createVector2, inverseMatrix3 } from '@flighthq/geometry';
import type { ImageResource } from '@flighthq/types';

import { createSampler, equalsSampler } from './sampler';
import {
  cloneTexture,
  copyTexture,
  createTexture,
  equalsTexture,
  getTextureHeight,
  getTextureInverseUvMatrix,
  getTextureUvMatrix,
  getTextureWidth,
  hasTextureUvTransform,
  isTextureReady,
  resetTextureUvTransform,
  setTextureFlip,
  setTextureImage,
  setTextureUvOffset,
  setTextureUvRotation,
  setTextureUvScale,
  transformTextureUv,
} from './texture';

const fakeImage = { width: 32, height: 64 } as ImageResource;

// Applies a column-major 3×3 uv matrix to (u, v, 1), writing the transformed coordinate into out.
function multiplyMatrix3Uv(out: { x: number; y: number }, matrix: { m: ArrayLike<number> }, u: number, v: number) {
  const m = matrix.m;
  out.x = m[0] * u + m[3] * v + m[6];
  out.y = m[1] * u + m[4] * v + m[7];
}

describe('cloneTexture', () => {
  it('shares the image but deep-clones the sampler and uv vectors', () => {
    const source = createTexture({
      colorSpace: 'linear',
      image: fakeImage,
      uvRotation: 0.5,
    });
    source.uvOffset.x = 0.25;
    source.uvScale.y = 3;

    const copy = cloneTexture(source);

    expect(copy).not.toBe(source);
    expect(copy.image).toBe(fakeImage);
    expect(copy.colorSpace).toStrictEqual('linear');
    expect(copy.uvRotation).toStrictEqual(0.5);
    expect(copy.sampler).not.toBe(source.sampler);
    expect(equalsSampler(copy.sampler, source.sampler)).toBe(true);
    expect(copy.uvOffset).not.toBe(source.uvOffset);
    expect(copy.uvOffset.x).toStrictEqual(0.25);
    expect(copy.uvScale.y).toStrictEqual(3);

    copy.uvOffset.x = 0.9;
    expect(source.uvOffset.x).toStrictEqual(0.25);
  });
});

describe('copyTexture', () => {
  it('writes every field from source into a distinct out, preserving out entity identities', () => {
    const source = createTexture({ colorSpace: 'linear', image: fakeImage, uvRotation: 1 });
    source.uvScale.x = 4;
    const out = createTexture();
    const outSampler = out.sampler;
    const outOffset = out.uvOffset;

    copyTexture(out, source);

    expect(out.image).toBe(fakeImage);
    expect(out.colorSpace).toStrictEqual('linear');
    expect(out.uvRotation).toStrictEqual(1);
    expect(out.uvScale.x).toStrictEqual(4);
    expect(out.sampler).toBe(outSampler);
    expect(out.uvOffset).toBe(outOffset);
  });

  it('is safe when out aliases source', () => {
    const source = createTexture({ colorSpace: 'linear', image: fakeImage, uvRotation: 2 });
    source.uvScale.x = 7;

    copyTexture(source, source);

    expect(source.colorSpace).toStrictEqual('linear');
    expect(source.image).toBe(fakeImage);
    expect(source.uvRotation).toStrictEqual(2);
    expect(source.uvScale.x).toStrictEqual(7);
  });
});

describe('createTexture', () => {
  it('applies the default unbound, srgb, identity-transform state', () => {
    const texture = createTexture();

    expect(texture.image).toBeNull();
    expect(texture.colorSpace).toStrictEqual('srgb');
    expect(texture.uvRotation).toStrictEqual(0);
    expect(texture.uvOffset.x).toStrictEqual(0);
    expect(texture.uvOffset.y).toStrictEqual(0);
    expect(texture.uvScale.x).toStrictEqual(1);
    expect(texture.uvScale.y).toStrictEqual(1);
    expect(equalsSampler(texture.sampler, createSampler())).toBe(true);
  });

  it('clones supplied sampler and uv vectors rather than aliasing them', () => {
    const sampler = createSampler({ anisotropy: 8 });
    const texture = createTexture({ sampler });

    expect(texture.sampler).not.toBe(sampler);
    expect(texture.sampler.anisotropy).toStrictEqual(8);
  });
});

describe('equalsTexture', () => {
  it('is true for textures with identical state and same image reference', () => {
    const a = createTexture({ image: fakeImage, colorSpace: 'linear' });
    const b = createTexture({ image: fakeImage, colorSpace: 'linear' });

    expect(equalsTexture(a, b)).toBe(true);
    expect(equalsTexture(a, a)).toBe(true);
  });

  it('is false when the image reference differs', () => {
    const other = { width: 4, height: 4 } as ImageResource;
    const a = createTexture({ image: fakeImage });
    const b = createTexture({ image: other });

    expect(equalsTexture(a, b)).toBe(false);
  });

  it('is false when colorSpace differs', () => {
    const a = createTexture({ colorSpace: 'linear' });
    const b = createTexture({ colorSpace: 'srgb' });

    expect(equalsTexture(a, b)).toBe(false);
  });

  it('is false when uvRotation differs', () => {
    const a = createTexture({ uvRotation: 0.5 });
    const b = createTexture({ uvRotation: 0 });

    expect(equalsTexture(a, b)).toBe(false);
  });

  it('is false when uvOffset differs', () => {
    const a = createTexture();
    const b = createTexture();
    b.uvOffset.x = 0.5;

    expect(equalsTexture(a, b)).toBe(false);
  });

  it('is false when uvScale differs', () => {
    const a = createTexture();
    const b = createTexture();
    b.uvScale.y = 2;

    expect(equalsTexture(a, b)).toBe(false);
  });

  it('is false when the sampler differs', () => {
    const a = createTexture();
    const b = createTexture({ sampler: createSampler({ mipmaps: false }) });

    expect(equalsTexture(a, b)).toBe(false);
  });

  it('is false for null or undefined operands', () => {
    const a = createTexture();

    expect(equalsTexture(a, null)).toBe(false);
    expect(equalsTexture(null, a)).toBe(false);
    expect(equalsTexture(undefined, undefined)).toBe(false);
  });
});

describe('getTextureHeight', () => {
  it('returns the image height when an image is bound', () => {
    const texture = createTexture({ image: fakeImage });

    expect(getTextureHeight(texture)).toStrictEqual(64);
  });

  it('returns -1 when no image is bound', () => {
    const texture = createTexture();

    expect(getTextureHeight(texture)).toStrictEqual(-1);
  });
});

describe('getTextureInverseUvMatrix', () => {
  it('produces the identity matrix for the default uv transform', () => {
    const texture = createTexture();
    const out = createMatrix3();

    getTextureInverseUvMatrix(out, texture);

    expect(out.m[0]).toBeCloseTo(1);
    expect(out.m[1]).toBeCloseTo(0);
    expect(out.m[2]).toBeCloseTo(0);
    expect(out.m[3]).toBeCloseTo(0);
    expect(out.m[4]).toBeCloseTo(1);
    expect(out.m[5]).toBeCloseTo(0);
    expect(out.m[8]).toBeCloseTo(1);
  });

  it('equals inverting the composed forward uv matrix', () => {
    const texture = createTexture({ uvRotation: Math.PI / 6 });
    setTextureUvScale(texture, 2, 3);
    setTextureUvOffset(texture, 0.1, 0.2);

    // The documented contract: compose getTextureUvMatrix, then inverse it via geometry.
    const expected = createMatrix3();
    getTextureUvMatrix(expected, texture);
    inverseMatrix3(expected, expected);

    const out = createMatrix3();
    getTextureInverseUvMatrix(out, texture);

    for (let k = 0; k < 9; k++) {
      expect(out.m[k]).toBeCloseTo(expected.m[k]);
    }
  });
});

describe('getTextureUvMatrix', () => {
  it('produces the identity matrix for the default uv transform', () => {
    const texture = createTexture();
    const out = createMatrix3();

    getTextureUvMatrix(out, texture);

    // Identity = [1,0,0; 0,1,0; 0,0,1]
    expect(out.m[0]).toBeCloseTo(1);
    expect(out.m[1]).toBeCloseTo(0);
    expect(out.m[2]).toBeCloseTo(0);
    expect(out.m[3]).toBeCloseTo(0);
    expect(out.m[4]).toBeCloseTo(1);
    expect(out.m[5]).toBeCloseTo(0);
    expect(out.m[6]).toBeCloseTo(0);
    expect(out.m[7]).toBeCloseTo(0);
    expect(out.m[8]).toBeCloseTo(1);
  });

  it('encodes offset in the translation column', () => {
    const texture = createTexture();
    setTextureUvOffset(texture, 0.25, 0.75);
    const out = createMatrix3();

    getTextureUvMatrix(out, texture);

    // Column-major: the translation column is m[6], m[7].
    expect(out.m[6]).toBeCloseTo(0.25); // tx
    expect(out.m[7]).toBeCloseTo(0.75); // ty
  });

  it('maps v to 1 - v for a vertical flip and u to 1 - u for a horizontal flip', () => {
    const out = createMatrix3();
    const scratch = createVector2();

    getTextureUvMatrix(out, createTexture({ flipY: true }));
    // Apply the matrix to (u, v) = (0.2, 0.3): expect (0.2, 0.7).
    multiplyMatrix3Uv(scratch, out, 0.2, 0.3);
    expect(scratch.x).toBeCloseTo(0.2);
    expect(scratch.y).toBeCloseTo(0.7);

    getTextureUvMatrix(out, createTexture({ flipX: true }));
    multiplyMatrix3Uv(scratch, out, 0.2, 0.3);
    expect(scratch.x).toBeCloseTo(0.8);
    expect(scratch.y).toBeCloseTo(0.3);
  });

  it('agrees with transformTextureUv when a flip combines with scale, rotation, and offset', () => {
    const texture = createTexture({ flipX: true, flipY: true, uvScale: createVector2(2, 3) });
    setTextureUvOffset(texture, 0.1, 0.2);
    setTextureUvRotation(texture, 0.5);
    const out = createMatrix3();
    getTextureUvMatrix(out, texture);

    const viaMatrix = createVector2();
    multiplyMatrix3Uv(viaMatrix, out, 0.35, 0.6);
    const viaInline = createVector2();
    transformTextureUv(viaInline, texture, 0.35, 0.6);
    expect(viaMatrix.x).toBeCloseTo(viaInline.x);
    expect(viaMatrix.y).toBeCloseTo(viaInline.y);
  });

  it('encodes scale in the diagonal', () => {
    const texture = createTexture();
    setTextureUvScale(texture, 2, 3);
    const out = createMatrix3();

    getTextureUvMatrix(out, texture);

    expect(out.m[0]).toBeCloseTo(2); // sx*cos(0) = sx
    expect(out.m[4]).toBeCloseTo(3); // sy*cos(0) = sy
  });

  it('matches KHR_texture_transform formula for a rotated, scaled, offset texture', () => {
    const r = Math.PI / 4;
    const texture = createTexture({ uvRotation: r });
    setTextureUvScale(texture, 2, 2);
    setTextureUvOffset(texture, 0.1, 0.2);
    const out = createMatrix3();

    getTextureUvMatrix(out, texture);

    const cosR = Math.cos(r);
    const sinR = Math.sin(r);
    // Column-major storage of rows [sx·cos, -sy·sin, tx], [sx·sin, sy·cos, ty], [0,0,1].
    expect(out.m[0]).toBeCloseTo(2 * cosR); // (0,0) sx*cos(r)
    expect(out.m[1]).toBeCloseTo(2 * sinR); // (1,0) sx*sin(r)
    expect(out.m[3]).toBeCloseTo(-2 * sinR); // (0,1) -sy*sin(r)
    expect(out.m[4]).toBeCloseTo(2 * cosR); // (1,1) sy*cos(r)
    expect(out.m[6]).toBeCloseTo(0.1); // (0,2) tx
    expect(out.m[7]).toBeCloseTo(0.2); // (1,2) ty
  });
});

describe('getTextureWidth', () => {
  it('returns the image width when an image is bound', () => {
    const texture = createTexture({ image: fakeImage });

    expect(getTextureWidth(texture)).toStrictEqual(32);
  });

  it('returns -1 when no image is bound', () => {
    const texture = createTexture();

    expect(getTextureWidth(texture)).toStrictEqual(-1);
  });
});

describe('hasTextureUvTransform', () => {
  it('is false for a freshly created identity-transform texture', () => {
    expect(hasTextureUvTransform(createTexture())).toBe(false);
  });

  it('is true when the scale is non-unit', () => {
    const texture = createTexture();
    setTextureUvScale(texture, 2, 2);

    expect(hasTextureUvTransform(texture)).toBe(true);
  });

  it('is true when the offset is non-zero', () => {
    const texture = createTexture();
    setTextureUvOffset(texture, 0.25, 0);

    expect(hasTextureUvTransform(texture)).toBe(true);
  });

  it('is true when a flip flag is set', () => {
    expect(hasTextureUvTransform(createTexture({ flipY: true }))).toBe(true);
    expect(hasTextureUvTransform(createTexture({ flipX: true }))).toBe(true);
  });

  it('is true when the rotation is non-zero', () => {
    const texture = createTexture();
    setTextureUvRotation(texture, 0.5);

    expect(hasTextureUvTransform(texture)).toBe(true);
  });

  it('is false again after resetTextureUvTransform', () => {
    const texture = createTexture();
    setTextureUvScale(texture, 3, 4);
    resetTextureUvTransform(texture);

    expect(hasTextureUvTransform(texture)).toBe(false);
  });
});

describe('isTextureReady', () => {
  it('is false with a null image and true once bound', () => {
    const texture = createTexture();

    expect(isTextureReady(texture)).toBe(false);

    texture.image = fakeImage;
    expect(isTextureReady(texture)).toBe(true);
  });
});

describe('resetTextureUvTransform', () => {
  it('restores the identity transform while leaving image, color space, and sampler untouched', () => {
    const texture = createTexture({ colorSpace: 'linear', image: fakeImage });
    const sampler = texture.sampler;
    setTextureUvOffset(texture, 0.4, 0.6);
    setTextureUvRotation(texture, Math.PI);
    setTextureUvScale(texture, 5, 7);

    resetTextureUvTransform(texture);

    expect(texture.uvOffset.x).toStrictEqual(0);
    expect(texture.uvOffset.y).toStrictEqual(0);
    expect(texture.uvRotation).toStrictEqual(0);
    expect(texture.uvScale.x).toStrictEqual(1);
    expect(texture.uvScale.y).toStrictEqual(1);
    expect(texture.colorSpace).toStrictEqual('linear');
    expect(texture.image).toBe(fakeImage);
    expect(texture.sampler).toBe(sampler);
  });
});

describe('setTextureFlip', () => {
  it('sets the flip flags in place', () => {
    const texture = createTexture();
    expect(texture.flipX).toBe(false);
    setTextureFlip(texture, true, true);
    expect(texture.flipX).toBe(true);
    expect(texture.flipY).toBe(true);
    setTextureFlip(texture, false, true);
    expect(texture.flipX).toBe(false);
    expect(texture.flipY).toBe(true);
  });
});

describe('setTextureImage', () => {
  it('binds and clears the image in place', () => {
    const texture = createTexture();

    setTextureImage(texture, fakeImage);
    expect(texture.image).toBe(fakeImage);

    setTextureImage(texture, null);
    expect(texture.image).toBeNull();
  });
});

describe('setTextureUvOffset', () => {
  it('updates the uvOffset in place', () => {
    const texture = createTexture();

    setTextureUvOffset(texture, 0.3, 0.7);

    expect(texture.uvOffset.x).toBeCloseTo(0.3);
    expect(texture.uvOffset.y).toBeCloseTo(0.7);
  });
});

describe('setTextureUvRotation', () => {
  it('updates uvRotation in place', () => {
    const texture = createTexture();

    setTextureUvRotation(texture, Math.PI);

    expect(texture.uvRotation).toBeCloseTo(Math.PI);
  });
});

describe('setTextureUvScale', () => {
  it('updates the uvScale in place', () => {
    const texture = createTexture();

    setTextureUvScale(texture, 4, 8);

    expect(texture.uvScale.x).toBeCloseTo(4);
    expect(texture.uvScale.y).toBeCloseTo(8);
  });
});

describe('transformTextureUv', () => {
  it('leaves a coordinate unchanged under the identity transform', () => {
    const texture = createTexture();
    const out = createVector2(0, 0);

    transformTextureUv(out, texture, 0.25, 0.75);

    expect(out.x).toBeCloseTo(0.25);
    expect(out.y).toBeCloseTo(0.75);
  });

  it('applies scale then offset', () => {
    const texture = createTexture();
    setTextureUvScale(texture, 2, 3);
    setTextureUvOffset(texture, 0.1, 0.2);
    const out = createVector2(0, 0);

    transformTextureUv(out, texture, 0.5, 0.5);

    expect(out.x).toBeCloseTo(2 * 0.5 + 0.1);
    expect(out.y).toBeCloseTo(3 * 0.5 + 0.2);
  });

  it('matches multiplying the coordinate by getTextureUvMatrix', () => {
    const texture = createTexture({ uvRotation: Math.PI / 3 });
    setTextureUvScale(texture, 1.5, 2.5);
    setTextureUvOffset(texture, 0.2, 0.4);
    const matrix = createMatrix3();
    getTextureUvMatrix(matrix, texture);
    const u = 0.3;
    const v = 0.8;
    const m = matrix.m;
    // Column-major: row 0 = m[0], m[3], m[6]; row 1 = m[1], m[4], m[7].
    const expectedX = m[0] * u + m[3] * v + m[6];
    const expectedY = m[1] * u + m[4] * v + m[7];
    const out = createVector2(0, 0);

    transformTextureUv(out, texture, u, v);

    expect(out.x).toBeCloseTo(expectedX);
    expect(out.y).toBeCloseTo(expectedY);
  });
});
