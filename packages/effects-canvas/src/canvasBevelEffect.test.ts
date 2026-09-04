import { createBevelEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { BevelEffect, CanvasRenderTarget, CanvasRenderTargetPool } from '@flighthq/types/contract';

import {
  applyBevelEffectToCanvas,
  clipCanvasBevelBand,
  defaultCanvasBevelEffectRunner,
  registerCanvasBevelEffect,
} from './canvasBevelEffect';
import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Recipe assertions rather than pixels — see canvasBlendEffect.test.ts. Scratch targets are pre-seeded so
// every pass is identifiable; the pool pops from the end, so the seed order reverses the acquire order.
function seededPool(ids: readonly string[]): { pool: CanvasRenderTargetPool; targets: CanvasRenderTarget[] } {
  const targets = ids.map((id) => {
    const target = createCanvasRenderTarget(4, 4);
    target.canvas.id = id;
    return target;
  });
  return {
    pool: (() => { const out = allocateEntity<unknown>(); out.creator = canvasTestSurfaceCreator; out.free = [...targets].reverse(); out.inUse = []; return finishEntity(out) as unknown; })() as CanvasRenderTargetPool,
    targets,
  };
}

const SCRATCH = ['blurred', 'lit', 'shade', 'side', 'tinted', 'band'];

interface Draw {
  entry: string;
  dx: number;
  dy: number;
}

function recordAll(log: Draw[], targets: readonly Readonly<CanvasRenderTarget>[]): void {
  for (const target of targets) {
    const context = target.context;
    const into = target.canvas.id;
    vi.spyOn(context, 'drawImage').mockImplementation(((image: CanvasImageSource, dx?: number, dy?: number) => {
      const from = (image as HTMLCanvasElement).id || 'canvas';
      log.push({ entry: `${from}->${into}|${context.globalCompositeOperation}`, dx: dx ?? 0, dy: dy ?? 0 });
    }) as typeof context.drawImage);
  }
}

function scene(): { source: CanvasRenderTarget; dest: CanvasRenderTarget } {
  const source = createCanvasRenderTarget(4, 4);
  const dest = createCanvasRenderTarget(4, 4);
  source.canvas.id = 'source';
  dest.canvas.id = 'dest';
  return { source, dest };
}

function bevel(over: Partial<BevelEffect> = {}): BevelEffect {
  return createBevelEffect(over);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyBevelEffectToCanvas', () => {
  it('offsets one copy toward the light and the other away by the same distance', () => {
    // Angle 0 so the offsets are exactly ∓distance on x. The two copies must be equal and OPPOSITE: a
    // bevel lit from one side is the difference between them, so shifting both the same way yields
    // nothing at all.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyBevelEffectToCanvas(source, dest, pool, bevel({ angle: 0, distance: 6 }));

    const toLit = log.find((d) => d.entry === 'blurred->lit|source-over');
    const toShade = log.find((d) => d.entry === 'blurred->shade|source-over');
    // toBeCloseTo rather than toEqual: negating a zero component yields -0, which differs from +0 only
    // under Object.is and is identical in every draw that follows.
    expect(toLit?.dx).toBeCloseTo(-6);
    expect(toLit?.dy).toBeCloseTo(0);
    expect(toShade?.dx).toBeCloseTo(6);
    expect(toShade?.dy).toBeCloseTo(0);
  });

  it('knocks each offset copy out of the other before tinting', () => {
    // The knockout is what turns two silhouettes into an edge band. Tinting first would fill the whole
    // offset silhouette, and the "bevel" would cover the shape rather than its rim.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyBevelEffectToCanvas(source, dest, pool, bevel());

    const entries = log.map((d) => d.entry);
    expect(entries).toContain('shade->side|destination-out');
    expect(entries).toContain('lit->side|destination-out');
    // Both sides are built in `side`, so neither offset copy is overwritten while the other still needs it.
    expect(entries.filter((e) => e === 'lit->lit|source-over' || e === 'shade->shade|source-over')).toEqual([]);
  });

  it('builds the highlight side before the shadow side', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyBevelEffectToCanvas(source, dest, pool, bevel());

    const entries = log.map((d) => d.entry);
    expect(entries.indexOf('shade->side|destination-out')).toBeLessThan(entries.indexOf('lit->side|destination-out'));
  });

  it('converts the angle from degrees', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyBevelEffectToCanvas(source, dest, pool, bevel({ angle: 90, distance: 5 }));

    const toShade = log.find((d) => d.entry === 'blurred->shade|source-over');
    expect(toShade?.dx).toBeCloseTo(0);
    expect(toShade?.dy).toBeCloseTo(5);
  });

  it('draws the source before the band', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyBevelEffectToCanvas(source, dest, pool, bevel());

    const toDest = log.filter((d) => d.entry.endsWith('->dest|source-over')).map((d) => d.entry);
    expect(toDest).toEqual(['source->dest|source-over', 'band->dest|source-over']);
  });

  it('drops the source when sourceMode is hide', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyBevelEffectToCanvas(source, dest, pool, bevel({ sourceMode: 'hide' }));

    expect(log.filter((d) => d.entry.endsWith('->dest|source-over')).map((d) => d.entry)).toEqual([
      'band->dest|source-over',
    ]);
  });

  it('returns every scratch target to the pool', () => {
    const { source, dest } = scene();
    const { pool } = seededPool(SCRATCH);

    applyBevelEffectToCanvas(source, dest, pool, bevel());

    expect(pool.inUse).toHaveLength(0);
    expect(pool.free).toHaveLength(SCRATCH.length);
  });

  it('runs without a caller-supplied pool', () => {
    const { source, dest } = scene();

    expect(() => applyBevelEffectToCanvas(source, dest, bevel())).not.toThrow();
  });
});

describe('clipCanvasBevelBand', () => {
  function clipOperation(bevelType: BevelEffect['bevelType']): string[] {
    const band = createCanvasRenderTarget(4, 4);
    const source = createCanvasRenderTarget(4, 4);
    band.canvas.id = 'band';
    source.canvas.id = 'source';
    const log: Draw[] = [];
    recordAll(log, [band]);
    clipCanvasBevelBand(band, source, bevelType);
    vi.restoreAllMocks();
    return log.map((d) => d.entry);
  }

  it('keeps the band inside the shape for inner, which is also the default', () => {
    expect(clipOperation('inner')).toEqual(['source->band|destination-in']);
    expect(clipOperation(undefined)).toEqual(['source->band|destination-in']);
  });

  it('keeps the band outside the shape for outer', () => {
    expect(clipOperation('outer')).toEqual(['source->band|destination-out']);
  });

  it('clips nothing for full', () => {
    expect(clipOperation('full')).toEqual([]);
  });
});

describe('defaultCanvasBevelEffectRunner', () => {
  it('applies the bevel through the pipeline context', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    defaultCanvasBevelEffectRunner({ state, source, dest, pool }, bevel());

    expect(log.map((d) => d.entry)).toContain('band->dest|source-over');
  });
});

describe('registerCanvasBevelEffect', () => {
  it('registers the default runner under the BevelEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBevelEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'BevelEffect')).toBe(defaultCanvasBevelEffectRunner);
  });
});
