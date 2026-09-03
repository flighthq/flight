import { createLensDistortionEffect } from '@flighthq/effects/contract';
import { createEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState } from './canvasEffectTestSupport';
import {
  applyLensDistortionEffectToCanvas,
  defaultCanvasLensDistortionEffectRunner,
  registerCanvasLensDistortionEffect,
} from './canvasLensDistortionEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// A width x height RGBA buffer whose red channel encodes the column and green the row, so a resample can
// be read back as "which source pixel did this destination pixel come from".
function createTargets(
  width: number,
  height: number,
): { dest: CanvasRenderTarget; source: CanvasRenderTarget; written: { data: Uint8ClampedArray | null } } {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      pixels[at] = Math.round((x / Math.max(1, width - 1)) * 255);
      pixels[at + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      pixels[at + 2] = 128;
      pixels[at + 3] = 255;
    }
  }
  const imageData = { data: pixels };
  const written: { data: Uint8ClampedArray | null } = { data: null };
  const source = createEntity({
    context: { getImageData: () => imageData },
    height,
    width,
  }) as unknown as CanvasRenderTarget;
  const dest = createEntity({
    context: {
      clearRect: () => {},
      filter: 'none',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      putImageData: (value: { data: Uint8ClampedArray }) => {
        written.data = value.data;
      },
      restore: () => {},
      save: () => {},
      setTransform: () => {},
    },
    height,
    width,
  }) as unknown as CanvasRenderTarget;
  return { dest, source, written };
}

const at = (data: Uint8ClampedArray, width: number, x: number, y: number): number[] => {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
};

describe('applyLensDistortionEffectToCanvas', () => {
  // amount 0 makes the polynomial the identity, so any deviation here is the resampler's own error
  // rather than the distortion's — the one case where the output is knowable exactly.
  it('is the identity at amount 0', () => {
    const { dest, source, written } = createTargets(8, 8);

    applyLensDistortionEffectToCanvas(source, dest, createLensDistortionEffect({ amount: 0 }));

    const original = source.context.getImageData(0, 0, 8, 8).data;
    expect([...written.data!]).toEqual([...original]);
  });

  // ★ THE CENTRE IS THE FIXED POINT OF THE POLYNOMIAL, so it must not move for any amount. A resampler
  // that is half a pixel off everywhere still passes an "output changed" check and fails this one.
  it('leaves the centre pixel where it was', () => {
    const { dest, source, written } = createTargets(9, 9);
    const before = at(source.context.getImageData(0, 0, 9, 9).data, 9, 4, 4);

    applyLensDistortionEffectToCanvas(source, dest, createLensDistortionEffect({ amount: 0.4 }));

    expect(at(written.data!, 9, 4, 4)).toEqual(before);
  });

  // Positive amount is barrel: a destination pixel away from the centre samples FURTHER out, so the
  // gradient it reads is from nearer the edge — the red channel at a right-of-centre pixel rises.
  it('samples further from the centre for a positive amount', () => {
    const { dest, source, written } = createTargets(16, 16);
    const before = at(source.context.getImageData(0, 0, 16, 16).data, 16, 12, 8)[0]!;

    applyLensDistortionEffectToCanvas(source, dest, createLensDistortionEffect({ amount: 0.5 }));

    expect(at(written.data!, 16, 12, 8)[0]!).toBeGreaterThan(before);
  });

  // Negative amount is pincushion — the opposite sign, which a magnitude-only test would miss.
  it('samples closer to the centre for a negative amount', () => {
    const { dest, source, written } = createTargets(16, 16);
    const before = at(source.context.getImageData(0, 0, 16, 16).data, 16, 12, 8)[0]!;

    applyLensDistortionEffectToCanvas(source, dest, createLensDistortionEffect({ amount: -0.5 }));

    expect(at(written.data!, 16, 12, 8)[0]!).toBeLessThan(before);
  });

  // Where the remap leaves the frame the shader writes opaque black rather than clamping, so the canvas
  // pass must too: clamping would silently smear the edge row outward instead of showing the boundary.
  it('writes opaque black where the sample leaves the frame', () => {
    const { dest, source, written } = createTargets(16, 16);

    applyLensDistortionEffectToCanvas(source, dest, createLensDistortionEffect({ amount: 3 }));

    expect(at(written.data!, 16, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('re-frames with scale so a larger scale pulls the sample inward', () => {
    const { dest, source, written } = createTargets(16, 16);
    const wide = createTargets(16, 16);

    applyLensDistortionEffectToCanvas(source, dest, createLensDistortionEffect({ amount: 0.5 }));
    applyLensDistortionEffectToCanvas(
      wide.source,
      wide.dest,
      createLensDistortionEffect({
        amount: 0.5,
        scale: 1.5,
      }),
    );

    expect(at(wide.written.data!, 16, 14, 8)[0]!).toBeLessThan(at(written.data!, 16, 14, 8)[0]!);
  });
});

describe('defaultCanvasLensDistortionEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    const { dest, pool, source, written } = {
      ...createTargets(8, 8),
      pool: createEntity({
        creator: canvasTestSurfaceCreator,
        free: [],
        inUse: [],
      }) as unknown as CanvasRenderTargetPool,
    };

    defaultCanvasLensDistortionEffectRunner(
      { dest, pool, source, state: {} as never },
      createLensDistortionEffect({ amount: 0 }),
    );

    expect(written.data).not.toBeNull();
  });
});

describe('registerCanvasLensDistortionEffect', () => {
  it('makes the runner resolvable for the LensDistortionEffect kind', () => {
    const context = { canvas: {}, getContextAttributes: () => ({}) };
    const state = createCanvasRenderState({ getContext: () => context } as unknown as HTMLCanvasElement, {});

    expect(getCanvasRenderEffectRunner(state, 'LensDistortionEffect')).toBeNull();
    registerCanvasLensDistortionEffect(state);
    expect(getCanvasRenderEffectRunner(state, 'LensDistortionEffect')).toBe(defaultCanvasLensDistortionEffectRunner);
  });
});
