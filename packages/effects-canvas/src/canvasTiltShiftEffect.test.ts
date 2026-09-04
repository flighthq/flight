import { createTiltShiftEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState } from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';
import {
  applyTiltShiftEffectToCanvas,
  defaultCanvasTiltShiftEffectRunner,
  registerCanvasTiltShiftEffect,
} from './canvasTiltShiftEffect';

// A black field with a single white ROW at each named index — an impulse, whose response is the blur
// kernel itself. It is deliberately NOT a stripe pattern: the runner takes seven taps at an integer
// spacing, so a period-2 stripe field aliases into looking untouched no matter how large the radius
// is, on this backend and equally on the Gl one. An impulse has no period to resonate with.
function createImpulseTargets(
  width: number,
  height: number,
  rows: ReadonlyArray<number>,
): { dest: CanvasRenderTarget; source: CanvasRenderTarget; written: { data: Uint8ClampedArray | null } } {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const value = rows.includes(y) ? 255 : 0;
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      pixels[at] = value;
      pixels[at + 1] = value;
      pixels[at + 2] = value;
      pixels[at + 3] = 255;
    }
  }
  const imageData = { data: pixels };
  const written: { data: Uint8ClampedArray | null } = { data: null };
  const source = (() => {
    const out = allocateEntity<any>();
    out.context = { getImageData: () => imageData };
    out.height = height;
    out.width = width;
    return finishEntity(out) as CanvasRenderTarget;
  })();
  const dest = (() => {
    const out = allocateEntity<any>();
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
    out.height = height;
    out.width = width;
    return finishEntity(out) as CanvasRenderTarget;
  })();
  return { dest, source, written };
}

const rowValue = (data: Uint8ClampedArray, width: number, y: number): number => data[y * width * 4]!;

describe('applyTiltShiftEffectToCanvas', () => {
  // ★ THE BAND IS THE WHOLE EFFECT, so the test compares INSIDE it against OUTSIDE it in one image.
  // An implementation that blurred the entire frame uniformly — the easiest thing to write by
  // accident — passes any "the image got blurrier" assertion and fails this one.
  it('keeps the focus band sharp while blurring above and below it', () => {
    const { dest, source, written } = createImpulseTargets(2, 64, [6, 32]);

    applyTiltShiftEffectToCanvas(source, dest, createTiltShiftEffect({ blur: 6, center: 0.5, width: 0.2 }));

    const data = written.data!;
    expect(rowValue(data, 2, 32)).toBe(255);
    expect(rowValue(data, 2, 6)).toBeLessThan(80);
  });

  // The band follows `center`, and `center` is measured DOWN from the top edge. With the band near the
  // top, the surviving impulse must be the top one — a runner that inherited the Gl flip keeps the
  // bottom one instead, and a centred band cannot tell the two apart because |y - 0.5| is symmetric.
  it('measures center down from the top edge', () => {
    const { dest, source, written } = createImpulseTargets(2, 64, [6, 57]);

    applyTiltShiftEffectToCanvas(source, dest, createTiltShiftEffect({ blur: 6, center: 0.1, width: 0.15 }));

    const data = written.data!;
    expect(rowValue(data, 2, 6)).toBe(255);
    expect(rowValue(data, 2, 57)).toBeLessThan(80);
  });

  it('is the identity when blur is 0', () => {
    const { dest, source, written } = createImpulseTargets(2, 16, [4]);
    const original = [...source.context.getImageData(0, 0, 2, 16).data];

    applyTiltShiftEffectToCanvas(source, dest, createTiltShiftEffect({ blur: 0, center: 0.5, width: 0.2 }));

    expect([...written.data!]).toEqual(original);
  });

  // A band wide enough to cover the frame leaves everything in focus, so nothing may blur. This is the
  // parameter's own extreme, and it separates `width` from `blur`.
  it('leaves the whole frame sharp when the band covers it', () => {
    const { dest, source, written } = createImpulseTargets(2, 32, [8, 24]);
    const original = [...source.context.getImageData(0, 0, 2, 32).data];

    applyTiltShiftEffectToCanvas(source, dest, createTiltShiftEffect({ blur: 8, center: 0.5, width: 2 }));

    expect([...written.data!]).toEqual(original);
  });

  // ★ SEVEN EQUAL TAPS IS THE KERNEL THE OTHER BACKENDS DRAW, and an impulse measures it directly: a
  // fully blurred white row keeps exactly 1/7 of its value, and each of the six offset rows receives
  // the same 1/7. A Gaussian of the same nominal radius leaves far more at the centre and far less at
  // the extremes, so this pins the weighting rather than merely observing that something spread.
  it('spreads an impulse into seven equal taps', () => {
    const { dest, source, written } = createImpulseTargets(2, 64, [32]);

    applyTiltShiftEffectToCanvas(source, dest, createTiltShiftEffect({ blur: 6, center: 0.5, width: 0.01 }));

    const data = written.data!;
    const share = Math.round(255 / 7);
    expect(rowValue(data, 2, 32)).toBe(share);
    expect(rowValue(data, 2, 26)).toBe(share);
    expect(rowValue(data, 2, 38)).toBe(share);
    expect(rowValue(data, 2, 29)).toBe(0);
  });

  it('leaves alpha at full where the source is opaque', () => {
    const { dest, source, written } = createImpulseTargets(2, 32, [16]);

    applyTiltShiftEffectToCanvas(source, dest, createTiltShiftEffect({ blur: 6, center: 0.5, width: 0.2 }));

    expect(written.data![3]).toBe(255);
  });
});

describe('defaultCanvasTiltShiftEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    const { dest, source, written } = createImpulseTargets(2, 16, [4]);

    defaultCanvasTiltShiftEffectRunner(
      {
        dest,
        pool: (() => {
          const out = allocateEntity<any>();
          out.creator = canvasTestSurfaceCreator;
          out.free = [];
          out.inUse = [];
          return finishEntity(out) as unknown;
        })() as CanvasRenderTargetPool,
        source,
        state: {} as never,
      },
      createTiltShiftEffect({ blur: 0 }),
    );

    expect(written.data).not.toBeNull();
  });
});

describe('registerCanvasTiltShiftEffect', () => {
  // Through the real registry, not a stub table: registerCanvasRenderEffect writes into the state's
  // runtime registries, so a hand-made object would assert against a shape production never touches.
  it('makes the runner resolvable for the TiltShiftEffect kind', () => {
    const context = { canvas: {}, getContextAttributes: () => ({}) };
    const state = createCanvasRenderState({ getContext: () => context } as unknown as HTMLCanvasElement, {});

    expect(getCanvasRenderEffectRunner(state, 'TiltShiftEffect')).toBeNull();
    registerCanvasTiltShiftEffect(state);
    expect(getCanvasRenderEffectRunner(state, 'TiltShiftEffect')).toBe(defaultCanvasTiltShiftEffectRunner);
  });
});
