import { createBloomEffect } from '@flighthq/effects/contract';
import { createEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool } from '@flighthq/types/contract';

import {
  applyBloomEffectToCanvas,
  defaultCanvasBloomEffectRunner,
  registerCanvasBloomEffect,
} from './canvasBloomEffect';
import { canvasTestSurfaceCreator, createCanvasRenderState } from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// A target whose ImageData is a real buffer, so the bright pass and the composite run their actual
// arithmetic rather than being observed through a spy. `filter` is accepted and ignored: the only CSS
// filter left in this effect is the blur between the two stages, and a blur of a flat one-pixel field
// is the identity, which keeps these tests about the two stages that changed.
function createTarget(pixels: ReadonlyArray<number>): CanvasRenderTarget {
  const data = new Uint8ClampedArray(pixels);
  const canvas = { __data: data };
  return createEntity({
    canvas,
    context: {
      clearRect: () => {},
      // Modelled rather than stubbed away: the effect copies the scene into dest and the bright branch
      // into the blur target through drawImage, so a no-op here would leave both empty and the
      // assertions below would be measuring the stub instead of the arithmetic.
      drawImage: (from: { __data: Uint8ClampedArray }) => {
        data.set(from.__data);
      },
      filter: 'none',
      // A FRESH COPY per call, because that is what the real getImageData returns. Handing back the
      // live buffer would let a pass that mutates its input in place corrupt the source it read from —
      // an aliasing the browser API does not have, and one that made this stub invent a failure.
      getImageData: () => ({ data: new Uint8ClampedArray(data) }),
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      putImageData: (value: { data: Uint8ClampedArray }) => {
        data.set(value.data);
      },
      restore: () => {},
      save: () => {},
      setTransform: () => {},
    },
    height: 1,
    width: pixels.length / 4,
  }) as unknown as CanvasRenderTarget;
}

// The pool hands out targets that start as copies of the source, which is what the real
// createCanvasRenderTarget-plus-draw sequence produces for a one-pixel field.
// Scratch targets start EMPTY. The effect is what fills them — the bright pass writes the gate's result
// and the blur copies it forward — so a pool pre-seeded with the source would hide a bright pass that
// never ran.
function createPool(width: number): CanvasRenderTargetPool {
  const blank = (): CanvasRenderTarget => createTarget(new Array(width * 4).fill(0));
  return createEntity({
    creator: canvasTestSurfaceCreator,
    free: [blank(), blank()],
    inUse: [],
  }) as unknown as CanvasRenderTargetPool;
}

const read = (target: CanvasRenderTarget): number[] => [...target.context.getImageData(0, 0, 1, 1).data];

describe('applyBloomEffectToCanvas', () => {
  // ★ THE CASE THAT FAILED BEFORE THIS EFFECT WAS REBUILT. A yellow pixel's blue channel sits below the
  // point the old CSS contrast/brightness chain crushed against, so blue was zeroed in the bright branch
  // and never added back: canvas held it at 92 while Gl reached 221 on the same scene. The gate is on
  // LUMINANCE, so a colour with one dim channel must survive whole.
  it('keeps a dim channel when the pixel luminance clears the threshold', () => {
    const source = createTarget([255, 255, 92, 255]);
    const dest = createTarget([0, 0, 0, 0]);

    applyBloomEffectToCanvas(
      source,
      dest,
      createPool(1),
      createBloomEffect({
        intensity: 1,
        threshold: 0.6,
      }),
    );

    // scene + bloom * 1, and the bloom branch kept the whole colour rather than dropping blue.
    expect(read(dest)[2]).toBeGreaterThan(92);
  });

  // The control that must NOT move: a pixel whose every channel already cleared the old crush point
  // agreed on both backends before the rebuild, so it must still.
  it('leaves a pixel whose channels all clear the threshold at full white', () => {
    const source = createTarget([255, 255, 255, 255]);
    const dest = createTarget([0, 0, 0, 0]);

    applyBloomEffectToCanvas(
      source,
      dest,
      createPool(1),
      createBloomEffect({
        intensity: 1,
        threshold: 0.6,
      }),
    );

    expect(read(dest).slice(0, 3)).toEqual([255, 255, 255]);
  });

  it('drops a pixel whose luminance is below the threshold', () => {
    const source = createTarget([20, 20, 20, 255]);
    const dest = createTarget([0, 0, 0, 0]);

    applyBloomEffectToCanvas(
      source,
      dest,
      createPool(1),
      createBloomEffect({
        intensity: 1,
        threshold: 0.6,
      }),
    );

    // The bright branch contributed nothing, so the scene passes through unchanged.
    expect(read(dest).slice(0, 3)).toEqual([20, 20, 20]);
  });

  // ★ THE SECOND DEFECT: the composite scaled ctx.globalAlpha, which is clamped to 1, so 1.4 and 1.0
  // rendered identically — intensity above 1 was structurally inexpressible rather than merely lossy.
  it('makes an intensity above 1 differ from an intensity of 1', () => {
    const atOne = createTarget([0, 0, 0, 0]);
    const atMore = createTarget([0, 0, 0, 0]);
    applyBloomEffectToCanvas(
      createTarget([255, 255, 92, 255]),
      atOne,
      createPool(1),
      createBloomEffect({
        intensity: 1,
        threshold: 0.6,
      }),
    );
    applyBloomEffectToCanvas(
      createTarget([255, 255, 92, 255]),
      atMore,
      createPool(1),
      createBloomEffect({
        intensity: 2,
        threshold: 0.6,
      }),
    );

    expect(read(atMore)[2]).toBeGreaterThan(read(atOne)[2]!);
  });

  it('leaves alpha to the scene rather than the bloom branch', () => {
    const dest = createTarget([0, 0, 0, 0]);

    applyBloomEffectToCanvas(
      createTarget([255, 255, 255, 128]),
      dest,
      createPool(1),
      createBloomEffect({
        intensity: 2,
        threshold: 0.6,
      }),
    );

    expect(read(dest)[3]).toBe(128);
  });
});

describe('defaultCanvasBloomEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    const dest = createTarget([0, 0, 0, 0]);

    defaultCanvasBloomEffectRunner(
      { dest, pool: createPool(1), source: createTarget([255, 255, 255, 255]), state: {} as never },
      createBloomEffect({ intensity: 1, threshold: 0.6 }),
    );

    expect(read(dest).slice(0, 3)).toEqual([255, 255, 255]);
  });
});

describe('registerCanvasBloomEffect', () => {
  it('makes the runner resolvable for the BloomEffect kind', () => {
    const context = { canvas: {}, getContextAttributes: () => ({}) };
    const state = createCanvasRenderState({ getContext: () => context } as unknown as HTMLCanvasElement, {});

    expect(getCanvasRenderEffectRunner(state, 'BloomEffect')).toBeNull();
    registerCanvasBloomEffect(state);
    expect(getCanvasRenderEffectRunner(state, 'BloomEffect')).toBe(defaultCanvasBloomEffectRunner);
  });
});
