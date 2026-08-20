import { createGlEffectGradientRampTexture } from './glEffectGradientRamp';

// A context that records the ramp bytes rather than uploading them, plus every parameter set on the
// texture — the sampler state is as much a part of a lookup table as its contents.
function createContext(): {
  gl: WebGL2RenderingContext;
  parameters: Map<number, number>;
  uploads: Uint8ClampedArray[];
} {
  const parameters = new Map<number, number>();
  const uploads: Uint8ClampedArray[] = [];
  const gl = {
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
    RGBA: 6408,
    RGBA8: 32856,
    TEXTURE_2D: 3553,
    TEXTURE_MAG_FILTER: 10241,
    TEXTURE_MIN_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    UNSIGNED_BYTE: 5121,
    bindTexture: vi.fn(),
    createTexture: vi.fn(() => ({ id: 'ramp' })),
    texImage2D: vi.fn(
      (
        _target: number,
        _level: number,
        _internal: number,
        _width: number,
        _height: number,
        _border: number,
        _format: number,
        _type: number,
        data: Uint8ClampedArray,
      ) => {
        uploads.push(data);
      },
    ),
    texParameteri: vi.fn((_target: number, name: number, value: number) => {
      parameters.set(name, value);
    }),
  } as unknown as WebGL2RenderingContext;
  return { gl, parameters, uploads };
}

function rampFor(
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): Uint8ClampedArray {
  const context = createContext();
  createGlEffectGradientRampTexture(context.gl, colors, alphas, ratios);
  return context.uploads[0]!;
}

function entryAt(ramp: Readonly<Uint8ClampedArray>, index: number): readonly number[] {
  return [...ramp.slice(index * 4, index * 4 + 4)];
}

describe('createGlEffectGradientRampTexture', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. Every gradient recipe on this backend — gradient
  // bevel, gradient glow — looks its band colour up in this table, so an error in the ramp is an error
  // in all of them, and it shows up as a plausible-but-wrong gradient rather than as a failure.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED, not restored. The
  // one `fix` in its ancestry (915040009, back when this lived in filters-wgpu) ADDED the wgpu caching
  // entry point rather than correcting a line here, so there is nothing to put back. Branch-2 shape.
  it('builds a 256-entry RGBA table', () => {
    expect(rampFor([0x000000, 0xffffff], [1, 1], [0, 255])).toHaveLength(256 * 4);
  });

  // ★ CONSTRUCTED CASE: `ratios` are BYTE scale, 0..255, and index into the table directly. Read as
  // normalised 0..1 instead, every stop but the first would sit past the end and the whole ramp would
  // flatten to its first colour — a gradient that is a solid block.
  // MEASURED by changing the table index from `const t = i` to `const t = i / 255` — 5 of 10 failed:
  //   AssertionError: expected [ 1, +0, +0, 255 ] to deeply equal [ 255, +0, +0, 255 ]
  //   AssertionError: expected [ 17, 34, 51, 128 ] to deeply equal [ 68, 85, 102, 255 ]
  //   AssertionError: expected [ 1, 1, 1, 255 ] to deeply equal [ 128, 128, 128, 255 ]
  //   AssertionError: expected [ 128, 128, 128, 1 ] to deeply equal [ 128, 128, 128, 128 ]
  //   AssertionError: expected [ 254, 1, +0, 255 ] to deeply equal [ +0, 255, +0, 255 ]
  it('places a stop at its byte-scale ratio, not at a normalised one', () => {
    const ramp = rampFor([0x000000, 0xff0000, 0x000000], [1, 1, 1], [0, 64, 255]);

    expect(entryAt(ramp, 64)).toEqual([255, 0, 0, 255]);
    // Either side of the peak the red has already fallen off, so the stop is a point and not a plateau.
    expect(entryAt(ramp, 32)[0]).toBeLessThan(255);
    expect(entryAt(ramp, 128)[0]).toBeLessThan(255);
  });

  it('holds the first colour below the first stop and the last above the last', () => {
    const ramp = rampFor([0x112233, 0x445566], [0.5, 1], [64, 192]);

    expect(entryAt(ramp, 0)).toEqual([0x11, 0x22, 0x33, 128]);
    expect(entryAt(ramp, 63)).toEqual([0x11, 0x22, 0x33, 128]);
    expect(entryAt(ramp, 255)).toEqual([0x44, 0x55, 0x66, 255]);
  });

  it('interpolates linearly between two stops', () => {
    const ramp = rampFor([0x000000, 0xffffff], [1, 1], [0, 255]);

    // 128/255 of the way from black to white, rounded.
    expect(entryAt(ramp, 128)).toEqual([128, 128, 128, 255]);
    expect(entryAt(ramp, 64)).toEqual([64, 64, 64, 255]);
  });

  // ★ THE CROSS-TERM, which a fixture varying only colour would miss: alpha is a separate ramp over the
  // same stops. Holding the colour constant is what makes an alpha error visible at all — with both
  // moving together, an alpha taken from the colour would still look like a gradient.
  it('ramps alpha independently of colour', () => {
    const ramp = rampFor([0x808080, 0x808080], [0, 1], [0, 255]);

    expect(entryAt(ramp, 0)).toEqual([128, 128, 128, 0]);
    expect(entryAt(ramp, 128)).toEqual([128, 128, 128, 128]);
    expect(entryAt(ramp, 255)).toEqual([128, 128, 128, 255]);
  });

  // The colour convention here is the SDK's one documented exception — `GradientBevelEffect` declares
  // "packed RGB integers with a separate alpha field", not the packed RGBA every other effect colour
  // uses. Pinned so the exception stays deliberate: read as RGBA, 0x112233 would be r=0x00 g=0x11 b=0x22.
  it('reads a colour as packed RGB with the alpha supplied separately', () => {
    const ramp = rampFor([0x112233], [1], [0]);

    expect(entryAt(ramp, 0)).toEqual([0x11, 0x22, 0x33, 255]);
  });

  it('returns a transparent table for no stops at all, rather than failing', () => {
    const ramp = rampFor([], [], []);

    expect(entryAt(ramp, 0)).toEqual([0, 0, 0, 0]);
    expect(entryAt(ramp, 255)).toEqual([0, 0, 0, 0]);
  });

  // Two stops at the same ratio make a span of zero width, and `(t - r0) / (r1 - r0)` over it is 0/0.
  // The guard resolves it to the span ENDING there rather than to NaN, which would have written 0 into
  // every channel — a black notch across the band.
  it('resolves a zero-width span to the stop that ends it instead of dividing by zero', () => {
    const ramp = rampFor([0xff0000, 0x00ff00, 0x0000ff, 0xffffff], [1, 1, 1, 1], [0, 64, 64, 255]);

    expect(entryAt(ramp, 64).every(Number.isFinite)).toBe(true);
    expect(entryAt(ramp, 64)).toEqual([0, 255, 0, 255]);
  });

  // ★ CONSTRUCTED CASE: the sampler state belongs to the lookup as much as the bytes do. LINEAR is what
  // makes a 256-entry table read as a smooth gradient, and CLAMP_TO_EDGE is what stops the last colour
  // wrapping around to the first — under REPEAT the two ends of the band would meet with a visible seam.
  // MEASURED by setting TEXTURE_WRAP_S to REPEAT — 1 of 10 failed, the predicted one and only it:
  //   AssertionError: expected undefined to be 33071 // Object.is equality
  it('samples the table smoothly and clamps at both ends', () => {
    const context = createContext();

    createGlEffectGradientRampTexture(context.gl, [0x000000, 0xffffff], [1, 1], [0, 255]);

    expect(context.parameters.get(context.gl.TEXTURE_MIN_FILTER)).toBe(context.gl.LINEAR);
    expect(context.parameters.get(context.gl.TEXTURE_MAG_FILTER)).toBe(context.gl.LINEAR);
    expect(context.parameters.get(context.gl.TEXTURE_WRAP_S)).toBe(context.gl.CLAMP_TO_EDGE);
    expect(context.parameters.get(context.gl.TEXTURE_WRAP_T)).toBe(context.gl.CLAMP_TO_EDGE);
  });

  // Ownership, which the header states and a caller has to honour: a NEW texture every call, so the
  // caller's `gl.deleteTexture` is deleting something nobody else still holds.
  it('allocates a new texture per call, since the caller owns it', () => {
    const context = createContext();

    createGlEffectGradientRampTexture(context.gl, [0x000000], [1], [0]);
    createGlEffectGradientRampTexture(context.gl, [0x000000], [1], [0]);

    expect(context.gl.createTexture).toHaveBeenCalledTimes(2);
  });
});
