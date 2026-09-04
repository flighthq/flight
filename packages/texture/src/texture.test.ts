import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix3, createVector2, inverseMatrix3 } from '@flighthq/geometry/contract';
import type { ImageResource, RenderTarget, Texture2D } from '@flighthq/types/contract';
import { ImageTextureSourceKind, RenderTargetTextureSourceKind } from '@flighthq/types/contract';

import { createSampler, equalsSampler } from './sampler';
import {
  cloneTexture,
  copyTexture,
  createTexture,
  createTexture2D,
  equalsTexture,
  getTextureHeight,
  getTextureInverseUvMatrix,
  getTextureSource,
  getTextureSourceKind,
  getTextureUvMatrix,
  getTextureWidth,
  hasTextureSource,
  hasTextureUvTransform,
  isTextureReady,
  resetTextureUvTransform,
  setTextureFlip,
  setTextureSource,
  setTextureUvFromPixelRect,
  setTextureUvOffset,
  setTextureUvRotation,
  setTextureUvScale,
  transformTextureUv,
} from './texture';

const fakeImage = { height: 64, kind: ImageTextureSourceKind, width: 32 } as ImageResource;

function makeRenderTarget(width: number, height: number): RenderTarget {
    const out = allocateEntity<RenderTarget>();
  out.height = height;
  out.kind = RenderTargetTextureSourceKind;
  out.version = 0;
  out.width = width;
  return finishEntity(out) as RenderTarget;; y: number }, matrix: { m: ArrayLike<number> }, u: number, v: number) {
  const m = matrix.m;
  out.x = m[0] * u + m[3] * v + m[6];
  out.y = m[1] * u + m[4] * v + m[7];
}

describe('cloneTexture', () => {
  it('shares the image but deep-clones the sampler and uv vectors', () => {
    const source = createTexture({
      colorSpace: 'linear',
      dimension: '2d',
      source: fakeImage,
      uvRotation: 0.5,
    });
    source.uvOffset.x = 0.25;
    source.uvScale.y = 3;

    const copy = cloneTexture(source);

    expect(copy).not.toBe(source);
    expect(copy.dimension).toBe('2d');
    expect(getTextureSource(copy)).toBe(fakeImage);
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

  it('preserves a render-target descriptor while cloning sampling state', () => {
    const target = makeRenderTarget(64, 32);
    target.colorSpace = 'linear';
    const source = createTexture({ dimension: '2d', source: target });

    const copy = cloneTexture(source);

    expect(getTextureSource(copy)).toBe(target);
    expect(copy.sampler).not.toBe(source.sampler);
  });
});

describe('copyTexture', () => {
  it('writes every field from source into a distinct out, preserving out entity identities', () => {
    const source = createTexture({
      colorSpace: 'linear',
      dimension: '2d',
      source: fakeImage,
      uvRotation: 1,
    });
    source.uvScale.x = 4;
    const out = createTexture();
    const outSampler = out.sampler;
    const outOffset = out.uvOffset;

    copyTexture(out, source);

    expect(getTextureSource(out)).toBe(fakeImage);
    expect(out.colorSpace).toStrictEqual('linear');
    expect(out.uvRotation).toStrictEqual(1);
    expect(out.uvScale.x).toStrictEqual(4);
    expect(out.sampler).toBe(outSampler);
    expect(out.uvOffset).toBe(outOffset);
  });

  it('is safe when out aliases source', () => {
    const source = createTexture({
      colorSpace: 'linear',
      dimension: '2d',
      source: fakeImage,
      uvRotation: 2,
    });
    source.uvScale.x = 7;

    copyTexture(source, source);

    expect(source.colorSpace).toStrictEqual('linear');
    expect(getTextureSource(source)).toBe(fakeImage);
    expect(source.uvRotation).toStrictEqual(2);
    expect(source.uvScale.x).toStrictEqual(7);
  });

  it('refuses to change the creation-time dimension', () => {
    const out = createTexture();
    const cube = createTexture({ dimension: 'cube' });

    expect(() => copyTexture(out, cube)).toThrow('copyTexture requires matching dimensions');
    expect(out.dimension).toBe('2d');
    expect(out.source).toBeNull();
  });
});

describe('createTexture', () => {
  it('creates a flat Texture2D with the default unbound, srgb, identity-transform state', () => {
    const texture = createTexture();

    expectTypeOf(texture).toEqualTypeOf<Texture2D>();
    expect(texture).not.toHaveProperty('storage');
    expect(texture.dimension).toStrictEqual('2d');
    expect(texture.source).toBeNull();
    expect(getTextureSource(texture)).toBeNull();
    expect(texture.colorSpace).toStrictEqual('srgb');
    expect(texture.version).toStrictEqual(0);
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

describe('createTexture2D', () => {
  it('builds the same 2D texture the general constructor does, without going through its switch', () => {
    const source = null;
    const leaf = createTexture2D({ colorSpace: 'linear', source, uvRotation: 0.25, version: 3 });
    const general = createTexture({ colorSpace: 'linear', source, uvRotation: 0.25, version: 3 });

    expectTypeOf(leaf).toEqualTypeOf<Texture2D>();
    // Compared field by field rather than by identity: these are two entities, and the claim is that
    // the leaf and the switch agree about what a 2D texture IS, which is what lets one compose the other.
    expect(leaf.dimension).toStrictEqual(general.dimension);
    expect(leaf.colorSpace).toStrictEqual(general.colorSpace);
    expect(leaf.source).toStrictEqual(general.source);
    expect(leaf.uvRotation).toStrictEqual(general.uvRotation);
    expect(leaf.version).toStrictEqual(general.version);
    expect(equalsSampler(leaf.sampler, general.sampler)).toBe(true);
  });

  it('defaults to the same unbound, srgb, identity-transform state', () => {
    const texture = createTexture2D();

    expect(texture.dimension).toStrictEqual('2d');
    expect(texture.source).toBeNull();
    expect(texture.colorSpace).toStrictEqual('srgb');
    expect(texture.uvScale.x).toStrictEqual(1);
    expect(texture.uvScale.y).toStrictEqual(1);
    expect(equalsSampler(texture.sampler, createSampler())).toBe(true);
  });

  it('clones supplied sampler and uv vectors rather than aliasing them', () => {
    const sampler = createSampler({ anisotropy: 8 });
    const uvOffset = createVector2(2, 3);
    const texture = createTexture2D({ sampler, uvOffset });

    expect(texture.sampler).not.toBe(sampler);
    expect(texture.uvOffset).not.toBe(uvOffset);
    expect(equalsSampler(texture.sampler, sampler)).toBe(true);
    expect(texture.uvOffset.x).toStrictEqual(2);
  });

  it('joins the resource it was built against EXACTLY ONCE', () => {
    // The general constructor delegates its 2D case here, and both used to attach. Once is the whole
    // assertion: a texture listed twice is realized twice by the loader.
    const resource = { textures: [] } as unknown as Parameters<typeof createTexture2D>[0] extends undefined
      ? never
      : NonNullable<NonNullable<Parameters<typeof createTexture2D>[0]>['resource']>;
    const leaf = createTexture2D({ resource });
    const viaGeneral = createTexture({ resource });

    expect(resource.textures).toStrictEqual([leaf, viaGeneral]);
  });
});

describe('equalsTexture', () => {
  it('is true for textures with identical state and same image reference', () => {
    const a = createTexture({ colorSpace: 'linear', dimension: '2d', source: fakeImage });
    const b = createTexture({ colorSpace: 'linear', dimension: '2d', source: fakeImage });

    expect(equalsTexture(a, b)).toBe(true);
    expect(equalsTexture(a, a)).toBe(true);
  });

  it('is false when the image reference differs', () => {
    const other = { width: 4, height: 4 } as ImageResource;
    const a = createTexture({ dimension: '2d', source: fakeImage });
    const b = createTexture({ dimension: '2d', source: other });

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
    const texture = createTexture({ dimension: '2d', source: fakeImage });

    expect(getTextureHeight(texture)).toStrictEqual(64);
  });

  it('returns -1 when no image is bound', () => {
    const texture = createTexture();

    expect(getTextureHeight(texture)).toStrictEqual(-1);
  });

  it('returns the render-target source height', () => {
    const texture = createTexture({
      dimension: '2d',
      source: makeRenderTarget(96, 48),
    });

    expect(getTextureHeight(texture)).toStrictEqual(48);
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

describe('getTextureSource', () => {
  it('returns the direct source and the first bound source in a layered texture', () => {
    const direct = createTexture({ dimension: '2d', source: fakeImage });
    const layered = createTexture({ dimension: '2d-array', sources: [null, fakeImage] });

    expect(getTextureSource(direct)).toBe(fakeImage);
    expect(getTextureSource(layered)).toBe(fakeImage);
  });

  it('returns null when every source slot is unbound', () => {
    expect(getTextureSource(createTexture())).toBeNull();
    expect(getTextureSource(createTexture({ dimension: '2d-array', sources: [null] }))).toBeNull();
  });
});

describe('getTextureSourceKind', () => {
  it('reads the key from the active source', () => {
    expect(getTextureSourceKind(createTexture())).toBeNull();
    expect(getTextureSourceKind(createTexture({ dimension: '2d', source: fakeImage }))).toBe(ImageTextureSourceKind);
    expect(
      getTextureSourceKind(
        createTexture({
          dimension: '2d',
          source: makeRenderTarget(8, 8),
        }),
      ),
    ).toBe(RenderTargetTextureSourceKind);
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
    const texture = createTexture({ dimension: '2d', source: fakeImage });

    expect(getTextureWidth(texture)).toStrictEqual(32);
  });

  it('returns -1 when no image is bound', () => {
    const texture = createTexture();

    expect(getTextureWidth(texture)).toStrictEqual(-1);
  });

  it('returns the render-target source width', () => {
    const texture = createTexture({
      dimension: '2d',
      source: makeRenderTarget(96, 48),
    });

    expect(getTextureWidth(texture)).toStrictEqual(96);
  });
});

describe('hasTextureSource', () => {
  it('detects CPU and GPU sources through the same field', () => {
    expect(hasTextureSource(createTexture())).toBe(false);
    expect(hasTextureSource(createTexture({ dimension: '2d', source: fakeImage }))).toBe(true);
    expect(
      hasTextureSource(
        createTexture({
          dimension: '2d',
          source: makeRenderTarget(8, 8),
        }),
      ),
    ).toBe(true);
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

    setTextureSource(texture, fakeImage);
    expect(isTextureReady(texture)).toBe(true);
  });
});

describe('resetTextureUvTransform', () => {
  it('restores the identity transform while leaving image, color space, and sampler untouched', () => {
    const texture = createTexture({ colorSpace: 'linear', dimension: '2d', source: fakeImage });
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
    expect(getTextureSource(texture)).toBe(fakeImage);
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

describe('setTextureSource', () => {
  it('binds and clears the image in place and advances the u32 version', () => {
    const texture = createTexture();

    setTextureSource(texture, fakeImage);
    expect(getTextureSource(texture)).toBe(fakeImage);
    expect(texture.version).toStrictEqual(1);

    setTextureSource(texture, fakeImage);
    expect(texture.version).toStrictEqual(1);

    setTextureSource(texture, null);
    expect(getTextureSource(texture)).toBeNull();
    expect(texture.version).toStrictEqual(2);
  });
});

describe('setTextureUvFromPixelRect', () => {
  it('normalizes a pixel rectangle against the texture dimensions', () => {
    const texture = createTexture({
      dimension: '2d',
      source: { height: 100, width: 200 } as ImageResource,
    });
    setTextureUvFromPixelRect(texture, 20, 10, 50, 25);
    expect(texture.uvOffset.x).toBeCloseTo(0.1);
    expect(texture.uvOffset.y).toBeCloseTo(0.1);
    expect(texture.uvScale.x).toBeCloseTo(0.25);
    expect(texture.uvScale.y).toBeCloseTo(0.25);
  });

  it('sets an empty window when the texture has no dimensions', () => {
    const texture = createTexture();
    setTextureUvFromPixelRect(texture, 20, 10, 50, 25);
    expect(texture.uvOffset).toMatchObject({ x: 0, y: 0 });
    expect(texture.uvScale).toMatchObject({ x: 0, y: 0 });
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
