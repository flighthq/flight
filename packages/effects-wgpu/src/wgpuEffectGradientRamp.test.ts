import { installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';

import { getWgpuEffectGradientRampTexture } from './wgpuEffectGradientRamp';

// The WebGPU flag enums are type-level only in @webgpu/types, so jsdom has no runtime values for the
// usage bits this module ORs together. The device below is a fake, but the constants have to be real.
beforeAll(() => installWgpuMock());

// A device that records the ramp bytes rather than uploading them, and hands back a distinct texture
// object per call so "is this the cached one" is an identity question the cache can actually get wrong.
function createState(): {
  createTexture: ReturnType<typeof vi.fn>;
  state: WgpuRenderState;
  uploads: Uint8ClampedArray[];
} {
  const uploads: Uint8ClampedArray[] = [];
  let next = 0;
  const createTexture = vi.fn(() => ({ id: `ramp-${next++}` }));
  const state = {
    device: {
      createTexture,
      queue: {
        writeTexture: vi.fn((_destination: unknown, data: ArrayBuffer) => {
          uploads.push(new Uint8ClampedArray(data));
        }),
      },
    },
  } as unknown as WgpuRenderState;
  return { createTexture, state, uploads };
}

function rampFor(
  colors: ReadonlyArray<number>,
  alphas: ReadonlyArray<number>,
  ratios: ReadonlyArray<number>,
): Uint8ClampedArray {
  const harness = createState();
  getWgpuEffectGradientRampTexture(harness.state, colors, alphas, ratios);
  return harness.uploads[0]!;
}

function entryAt(ramp: Readonly<Uint8ClampedArray>, index: number): readonly number[] {
  return [...ramp.slice(index * 4, index * 4 + 4)];
}

describe('getWgpuEffectGradientRampTexture', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. Every gradient recipe on this backend — gradient
  // bevel, gradient glow — looks its band colour up in this table, so an error in the ramp is an error
  // in all of them, and it reads as a plausible-but-wrong gradient rather than as a failure.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE. The one `fix` in its ancestry (915040009, when this
  // lived in filters-wgpu) ADDED this cached entry point rather than correcting a line, so there is
  // nothing to restore: the cases below are CONSTRUCTED, branch-2 shape.
  it('builds a 256-entry RGBA table', () => {
    expect(rampFor([0x000000, 0xffffff], [1, 1], [0, 255])).toHaveLength(256 * 4);
  });

  // ★ CONSTRUCTED CASE: `ratios` are BYTE scale, 0..255, and index into the table directly. Read as
  // normalised 0..1 instead, every stop but the first would sit past the end and the ramp would flatten
  // to its first colour — a gradient that is a solid block.
  // MEASURED by changing the table index from `const t = i` to `const t = i / 255` — 4 of 10 failed:
  //   AssertionError: expected [ 1, +0, +0, 255 ] to deeply equal [ 255, +0, +0, 255 ]
  //   AssertionError: expected [ 17, 34, 51, 128 ] to deeply equal [ 68, 85, 102, 255 ]
  //   AssertionError: expected [ 1, 1, 1, 255 ] to deeply equal [ 128, 128, 128, 255 ]
  //   AssertionError: expected [ 128, 128, 128, 1 ] to deeply equal [ 128, 128, 128, 128 ]
  it('places a stop at its byte-scale ratio, not at a normalised one', () => {
    const ramp = rampFor([0x000000, 0xff0000, 0x000000], [1, 1, 1], [0, 64, 255]);

    expect(entryAt(ramp, 64)).toEqual([255, 0, 0, 255]);
    expect(entryAt(ramp, 32)[0]).toBeLessThan(255);
    expect(entryAt(ramp, 128)[0]).toBeLessThan(255);
  });

  it('holds the first colour below the first stop and the last above the last', () => {
    const ramp = rampFor([0x112233, 0x445566], [0.5, 1], [64, 192]);

    expect(entryAt(ramp, 0)).toEqual([0x11, 0x22, 0x33, 128]);
    expect(entryAt(ramp, 255)).toEqual([0x44, 0x55, 0x66, 255]);
  });

  it('interpolates linearly between two stops', () => {
    const ramp = rampFor([0x000000, 0xffffff], [1, 1], [0, 255]);

    expect(entryAt(ramp, 128)).toEqual([128, 128, 128, 255]);
    expect(entryAt(ramp, 64)).toEqual([64, 64, 64, 255]);
  });

  // ★ THE CROSS-TERM, which a fixture varying only colour would miss: alpha is a separate ramp over the
  // same stops, so holding the colour constant is what makes an alpha error visible at all.
  it('ramps alpha independently of colour', () => {
    const ramp = rampFor([0x808080, 0x808080], [0, 1], [0, 255]);

    expect(entryAt(ramp, 0)).toEqual([128, 128, 128, 0]);
    expect(entryAt(ramp, 128)).toEqual([128, 128, 128, 128]);
    expect(entryAt(ramp, 255)).toEqual([128, 128, 128, 255]);
  });

  // The SDK's one documented colour exception, pinned so it stays deliberate: `GradientBevelEffect`
  // declares "packed RGB integers with a separate alpha field", not the packed RGBA every other effect
  // colour uses. Read as RGBA, 0x112233 would be r=0x00 g=0x11 b=0x22.
  it('reads a colour as packed RGB with the alpha supplied separately', () => {
    expect(entryAt(rampFor([0x112233], [1], [0]), 0)).toEqual([0x11, 0x22, 0x33, 255]);
  });

  it('returns a transparent table for no stops at all, rather than failing', () => {
    expect(entryAt(rampFor([], [], []), 0)).toEqual([0, 0, 0, 0]);
  });

  // ★ THE REASON THIS ENTRY POINT EXISTS AT ALL, and the half the Gl sibling does not have. A recipe runs
  // inside the frame's command encoder and does not control submit timing, so it cannot safely destroy a
  // per-call texture — the encoder still references it at submit. Caching removes the question: the
  // texture is owned by the render state and never destroyed mid-encoder.
  it('reuses one texture for the same stops rather than building a new one each frame', () => {
    const harness = createState();

    const first = getWgpuEffectGradientRampTexture(harness.state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    const second = getWgpuEffectGradientRampTexture(harness.state, [0x000000, 0xffffff], [1, 1], [0, 255]);

    expect(second).toBe(first);
    expect(harness.createTexture).toHaveBeenCalledTimes(1);
  });

  // ★ CONSTRUCTED CASE: the cache key covers colours, alphas AND ratios. Two gradient recipes in one
  // frame that differed only in alpha, or only in stop positions, would otherwise alias each other's
  // ramp and draw with the wrong band — the failure a cache keyed on colours alone produces.
  // MEASURED by cutting the key down to `colors.join(',')` — 1 of 10 failed, the predicted one and only
  // it, on the alphas axis first:
  //   AssertionError: expected { id: 'ramp-0' } not to be { id: 'ramp-0' } // Object.is equality
  it('gives distinct stops distinct textures, on every axis of the key', () => {
    const harness = createState();
    const base = getWgpuEffectGradientRampTexture(harness.state, [0x000000, 0xffffff], [1, 1], [0, 255]);

    expect(getWgpuEffectGradientRampTexture(harness.state, [0xff0000, 0x0000ff], [1, 1], [0, 255])).not.toBe(base);
    expect(getWgpuEffectGradientRampTexture(harness.state, [0x000000, 0xffffff], [0, 1], [0, 255])).not.toBe(base);
    expect(getWgpuEffectGradientRampTexture(harness.state, [0x000000, 0xffffff], [1, 1], [0, 128])).not.toBe(base);
    expect(harness.createTexture).toHaveBeenCalledTimes(4);
  });

  // Keyed by STATE: a texture belongs to the device that created it, so two states never share one.
  it('gives each render state its own ramp texture', () => {
    const first = createState();
    const second = createState();

    const a = getWgpuEffectGradientRampTexture(first.state, [0x000000, 0xffffff], [1, 1], [0, 255]);
    const b = getWgpuEffectGradientRampTexture(second.state, [0x000000, 0xffffff], [1, 1], [0, 255]);

    expect(b).not.toBe(a);
  });
});
