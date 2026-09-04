import { createPosterizeEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState } from './canvasEffectTestSupport';
import {
  applyPosterizeEffectToCanvas,
  defaultCanvasPosterizeEffectRunner,
  registerCanvasPosterizeEffect,
} from './canvasPosterizeEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Stand-ins for the two contexts drawCanvasImageDataPass touches, matching the shape
// canvasColorMatrixPass.test.ts uses for the same reason: it keeps the assertion independent of module
// load order in a non-isolated suite.
function createStubTargets(pixels: ReadonlyArray<number>): {
  dest: CanvasRenderTarget;
  source: CanvasRenderTarget;
  written: { data: Uint8ClampedArray | null };
} {
  const imageData = { data: new Uint8ClampedArray(pixels) };
  const written: { data: Uint8ClampedArray | null } = { data: null };
  const source = (() => {
    const out = allocateEntity<unknown>();
    out.context = { getImageData: () => imageData };
    out.height = 1;
    out.width = pixels.length / 4;
    return finishEntity(out) as unknown;
  })();
  const dest = (() => {
    const out = allocateEntity<unknown>();
    out.context = {
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
    };
    out.height = 1;
    out.width = pixels.length / 4;
    return finishEntity(out) as unknown;
  })();
  return { dest, source, written };
}

// The Gl/Wgpu recipe, in the float domain: floor(c * levels) / (levels - 1), clamped. Reimplemented here
// from the shader rather than from the implementation under test, so the two can disagree.
function expected(byte: number, levels: number): number {
  const value = byte / 255;
  const quantised = Math.floor(value * levels) / (levels - 1);
  return Math.round(Math.max(0, Math.min(1, quantised)) * 255);
}

describe('applyPosterizeEffectToCanvas', () => {
  it('quantises each channel to the levels the shader would produce', () => {
    const input = [0, 64, 128, 255, 192, 200, 255, 255];
    const { dest, source, written } = createStubTargets(input);

    applyPosterizeEffectToCanvas(source, dest, createPosterizeEffect({ levels: 4 }));

    expect(written.data).not.toBeNull();
    expect([...written.data!]).toEqual([
      expected(0, 4),
      expected(64, 4),
      expected(128, 4),
      255,
      expected(192, 4),
      expected(200, 4),
      expected(255, 4),
      255,
    ]);
  });

  // ★ THE STEP FUNCTION IS THE POINT, so the test has to show a step. Two inputs inside one level must
  // come out identical and two inputs across a boundary must not — a pass that merely dimmed every
  // channel would satisfy a "value changed" assertion and fail this one.
  it('collapses values inside a level and separates values across one', () => {
    const { dest, source, written } = createStubTargets([100, 120, 200, 255]);

    applyPosterizeEffectToCanvas(source, dest, createPosterizeEffect({ levels: 4 }));

    const [red, green, blue] = written.data!;
    expect(red).toBe(green); // 100 and 120 both sit in the second quarter
    expect(blue).not.toBe(red); // 200 is in the fourth
  });

  it('leaves alpha untouched', () => {
    const { dest, source, written } = createStubTargets([10, 20, 30, 40]);

    applyPosterizeEffectToCanvas(source, dest, createPosterizeEffect({ levels: 8 }));

    expect(written.data![3]).toBe(40);
  });

  // levels below 2 would divide by zero in (levels - 1); the Gl runner clamps to 2 and so must this one.
  it('clamps levels to at least 2 rather than dividing by zero', () => {
    const { dest, source, written } = createStubTargets([0, 128, 255, 255]);

    applyPosterizeEffectToCanvas(source, dest, createPosterizeEffect({ levels: 1 }));

    expect([...written.data!].every((value) => Number.isFinite(value))).toBe(true);
    expect([...written.data!].slice(0, 3)).toEqual([expected(0, 2), expected(128, 2), expected(255, 2)]);
  });

  it('defaults to 8 levels when none is given', () => {
    const { dest, source, written } = createStubTargets([137, 137, 137, 255]);

    applyPosterizeEffectToCanvas(source, dest, createPosterizeEffect());

    expect(written.data![0]).toBe(expected(137, 8));
  });
});

describe('defaultCanvasPosterizeEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    const { dest, source, written } = createStubTargets([255, 0, 0, 255]);

    defaultCanvasPosterizeEffectRunner(
      {
        dest,
        pool: (() => { const out = allocateEntity<number>(); out.creator = canvasTestSurfaceCreator; out.free = []; out.inUse = []; return finishEntity(out) as unknown; })() as CanvasRenderTargetPool,
        source,
        state: {} as never,
      },
      createPosterizeEffect({ levels: 2 }),
    );

    expect(written.data![0]).toBe(expected(255, 2));
  });
});

describe('registerCanvasPosterizeEffect', () => {
  // Goes through the real registry rather than a stub table: registerCanvasRenderEffect writes into the
  // state's RUNTIME registries, so a hand-made { renderEffects } object would assert against a shape the
  // production path never touches — a test that passes while the registration goes somewhere else.
  it('makes the runner resolvable for the PosterizeEffect kind', () => {
    const context = { canvas: {}, getContextAttributes: () => ({}) };
    const state = createCanvasRenderState({ getContext: () => context } as unknown as HTMLCanvasElement, {});

    expect(getCanvasRenderEffectRunner(state, 'PosterizeEffect')).toBeNull();
    registerCanvasPosterizeEffect(state);
    expect(getCanvasRenderEffectRunner(state, 'PosterizeEffect')).toBe(defaultCanvasPosterizeEffectRunner);
  });
});
