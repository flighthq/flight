import type { CanvasRenderTarget, CanvasRenderTargetPool, GradientBevelEffect } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import {
  applyGradientBevelEffectToCanvas,
  defaultCanvasGradientBevelEffectRunner,
  registerCanvasGradientBevelEffect,
} from './canvasGradientBevelEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Recipe assertions rather than pixels — see canvasBlendEffect.test.ts. Scratch targets are pre-seeded so
// each pass is identifiable; the pool pops from the end, so the seed order reverses the acquire order.
function seededPool(ids: readonly string[]): { pool: CanvasRenderTargetPool; targets: CanvasRenderTarget[] } {
  const targets = ids.map((id) => {
    const target = createCanvasRenderTarget(4, 4);
    target.canvas.id = id;
    return target;
  });
  return { pool: { creator: canvasTestSurfaceCreator, free: [...targets].reverse(), inUse: [] }, targets };
}

function recordAll(log: string[], targets: readonly Readonly<CanvasRenderTarget>[]): void {
  for (const target of targets) {
    const context = target.context;
    const into = target.canvas.id;
    vi.spyOn(context, 'drawImage').mockImplementation(((image: CanvasImageSource) => {
      log.push(`${(image as HTMLCanvasElement).id || 'canvas'}->${into}|${context.globalCompositeOperation}`);
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

const RAMP = { alphas: [1, 1], colors: [0xff0000, 0x0000ff], ratios: [0, 255] };

function effectOf(over: Partial<GradientBevelEffect> = {}): GradientBevelEffect {
  return { kind: 'GradientBevelEffect', ...RAMP, ...over } as GradientBevelEffect;
}

afterEach(() => {
  vi.restoreAllMocks();
});
const SCRATCH = ['blurred', 'lit', 'shade', 'side', 'ramped', 'band'];

describe('applyGradientBevelEffectToCanvas', () => {
  it('builds both sides by knockout and accumulates the ramped result into the band', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyGradientBevelEffectToCanvas(source, dest, pool, effectOf());

    expect(log).toContain('shade->side|destination-out');
    expect(log).toContain('lit->side|destination-out');
    // Two ramp lookups, one per side, each composited into the band.
    expect(log.filter((e) => e === 'ramped->band|source-over')).toHaveLength(2);
  });

  it('offsets the two copies in opposite directions', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const offsets: Record<string, number[]> = {};
    for (const target of [...targets, dest]) {
      const context = target.context;
      const into = target.canvas.id;
      vi.spyOn(context, 'drawImage').mockImplementation(((image: CanvasImageSource, dx?: number, dy?: number) => {
        offsets[`${(image as HTMLCanvasElement).id}->${into}`] = [dx ?? 0, dy ?? 0];
      }) as typeof context.drawImage);
    }

    applyGradientBevelEffectToCanvas(source, dest, pool, effectOf({ angle: 0, distance: 6 }));

    expect(offsets['blurred->lit'][0]).toBeCloseTo(-6);
    expect(offsets['blurred->shade'][0]).toBeCloseTo(6);
  });

  it('clips the band inside the shape by default and outside it for outer', () => {
    for (const [bevelType, operation] of [
      [undefined, 'source->band|destination-in'],
      ['outer', 'source->band|destination-out'],
    ] as const) {
      const { source, dest } = scene();
      const { pool, targets } = seededPool(SCRATCH);
      const log: string[] = [];
      recordAll(log, [...targets, dest]);

      applyGradientBevelEffectToCanvas(source, dest, pool, effectOf({ bevelType }));

      expect(log).toContain(operation);
      vi.restoreAllMocks();
    }
  });

  it('reads the two sides from opposite ends of one ramp', () => {
    // The signed ramp IS the effect: the shadow edge takes the ramp's low end and the highlight edge its
    // high end. Both sides reading the same direction would give a bevel with two identically-coloured
    // rims, which is a gradient glow with extra steps. Invisible to a drawImage log, because the lookup
    // writes through putImageData — so this reads the buffers it wrote.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const side = targets[SCRATCH.indexOf('side')];
    const ramped = targets[SCRATCH.indexOf('ramped')];

    // A fully covered side, so each lookup lands at its extreme rather than both at the midpoint.
    const covered = side.context.createImageData(4, 4);
    for (let i = 0; i < 16; i++) covered.data[i * 4 + 3] = 255;
    vi.spyOn(side.context, 'getImageData').mockReturnValue(covered);
    const written: number[][] = [];
    vi.spyOn(ramped.context, 'putImageData').mockImplementation(((image: ImageData) => {
      written.push([image.data[0], image.data[1], image.data[2], image.data[3]]);
    }) as typeof ramped.context.putImageData);

    applyGradientBevelEffectToCanvas(source, dest, pool, effectOf());

    // Red at ratio 0, blue at ratio 255: highlight reads blue, shadow reads red.
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual([0, 0, 255, 255]);
    expect(written[1]).toEqual([255, 0, 0, 255]);
  });

  it('draws the source before the band', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyGradientBevelEffectToCanvas(source, dest, pool, effectOf());

    expect(log.filter((e) => e.endsWith('->dest|source-over'))).toEqual([
      'source->dest|source-over',
      'band->dest|source-over',
    ]);
  });

  it('returns every scratch target to the pool', () => {
    const { source, dest } = scene();
    const { pool } = seededPool(SCRATCH);

    applyGradientBevelEffectToCanvas(source, dest, pool, effectOf());

    expect(pool.inUse).toHaveLength(0);
    expect(pool.free).toHaveLength(SCRATCH.length);
  });

  it('runs without a caller-supplied pool', () => {
    const { source, dest } = scene();

    expect(() => applyGradientBevelEffectToCanvas(source, dest, effectOf())).not.toThrow();
  });
});

describe('defaultCanvasGradientBevelEffectRunner', () => {
  it('applies the bevel through the pipeline context', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    defaultCanvasGradientBevelEffectRunner({ state, source, dest, pool }, effectOf());

    expect(log).toContain('band->dest|source-over');
  });
});

describe('registerCanvasGradientBevelEffect', () => {
  it('registers the default runner under the GradientBevelEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasGradientBevelEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'GradientBevelEffect')).toBe(defaultCanvasGradientBevelEffectRunner);
  });
});
