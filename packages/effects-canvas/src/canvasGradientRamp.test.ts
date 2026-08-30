import { createCanvasRenderTarget } from './canvasEffectTestSupport';
import { applyCanvasGradientRampLookup, buildCanvasGradientRamp } from './canvasGradientRamp';

function entry(ramp: Readonly<Uint8ClampedArray>, index: number): number[] {
  return [ramp[index * 4], ramp[index * 4 + 1], ramp[index * 4 + 2], ramp[index * 4 + 3]];
}

describe('applyCanvasGradientRampLookup', () => {
  // jsdom's 2D context does not rasterize, but getImageData/putImageData round-trip a real buffer, so a
  // per-pixel pass IS verifiable here in a way a drawImage recipe is not. Seed the source buffer, run the
  // pass, read the destination back.
  function runLookup(alphas: readonly number[], ramp: Uint8ClampedArray, bias?: number, scale?: number): number[][] {
    const source = createCanvasRenderTarget(alphas.length, 1);
    const dest = createCanvasRenderTarget(alphas.length, 1);
    const seeded = source.context.createImageData(alphas.length, 1);
    for (let i = 0; i < alphas.length; i++) seeded.data[i * 4 + 3] = alphas[i];
    vi.spyOn(source.context, 'getImageData').mockReturnValue(seeded);
    let written: ImageData | null = null;
    vi.spyOn(dest.context, 'putImageData').mockImplementation(((image: ImageData) => {
      written = image;
    }) as typeof dest.context.putImageData);

    applyCanvasGradientRampLookup(dest, source, ramp, bias, scale);

    const out = written as ImageData | null;
    const result: number[][] = [];
    for (let i = 0; i < alphas.length; i++) {
      result.push([out!.data[i * 4], out!.data[i * 4 + 1], out!.data[i * 4 + 2], out!.data[i * 4 + 3]]);
    }
    vi.restoreAllMocks();
    return result;
  }

  it('replaces each pixel with the ramp entry its alpha indexes', () => {
    const ramp = buildCanvasGradientRamp([0x000000, 0xff0000], [0, 1], [0, 255]);

    // Alpha 0 reads the ramp's first entry, alpha 255 its last — the index is the VALUE at the pixel,
    // which is what makes this a lookup rather than a spatial gradient.
    expect(runLookup([0, 255], ramp)).toEqual([entry(ramp, 0), entry(ramp, 255)]);
  });

  it('maps through bias and scale so a signed band can read one ramp from its midpoint', () => {
    const ramp = buildCanvasGradientRamp([0x000000, 0xffffff], [1, 1], [0, 255]);

    // The bevel's two halves: highlight runs upward from the midpoint, shadow downward. A full-strength
    // pixel therefore lands at opposite ends of the same ramp depending on which side built it.
    expect(runLookup([255], ramp, 0.5, 0.5)).toEqual([entry(ramp, 255)]);
    expect(runLookup([255], ramp, 0.5, -0.5)).toEqual([entry(ramp, 0)]);
    expect(runLookup([0], ramp, 0.5, 0.5)).toEqual([entry(ramp, 128)]);
  });

  it('clamps an index the bias and scale push outside the ramp', () => {
    const ramp = buildCanvasGradientRamp([0x102030, 0x405060], [1, 1], [0, 255]);

    expect(runLookup([255], ramp, 2, 1)).toEqual([entry(ramp, 255)]);
    expect(runLookup([255], ramp, -2, 1)).toEqual([entry(ramp, 0)]);
  });
});

describe('buildCanvasGradientRamp', () => {
  it('interpolates linearly between stops', () => {
    const ramp = buildCanvasGradientRamp([0x000000, 0xffffff], [0, 1], [0, 255]);

    expect(entry(ramp, 0)).toEqual([0, 0, 0, 0]);
    expect(entry(ramp, 255)).toEqual([255, 255, 255, 255]);
    // Midpoint is the average of both ends, per channel and in alpha.
    const mid = entry(ramp, 128);
    expect(mid[0]).toBeGreaterThan(120);
    expect(mid[0]).toBeLessThan(136);
    expect(mid[3]).toBeGreaterThan(120);
    expect(mid[3]).toBeLessThan(136);
  });

  it('extends the first and last stop to the ends of the ramp', () => {
    // Stops covering only the middle: everything below the first ratio holds the first colour and
    // everything above the last holds the last, rather than fading to transparent black.
    const ramp = buildCanvasGradientRamp([0xff0000, 0x00ff00], [1, 1], [64, 192]);

    expect(entry(ramp, 0)).toEqual([255, 0, 0, 255]);
    expect(entry(ramp, 255)).toEqual([0, 255, 0, 255]);
  });

  it('returns a fully transparent ramp when there are no stops', () => {
    const ramp = buildCanvasGradientRamp([], [], []);

    expect(ramp).toHaveLength(256 * 4);
    expect(entry(ramp, 0)).toEqual([0, 0, 0, 0]);
    expect(entry(ramp, 255)).toEqual([0, 0, 0, 0]);
  });

  it('takes the later stop when two share a ratio rather than dividing by zero', () => {
    const ramp = buildCanvasGradientRamp([0xff0000, 0x00ff00, 0x0000ff], [1, 1, 1], [0, 128, 128]);

    expect(entry(ramp, 200).every((c) => Number.isFinite(c))).toBe(true);
    expect(entry(ramp, 255)).toEqual([0, 0, 255, 255]);
  });
});
