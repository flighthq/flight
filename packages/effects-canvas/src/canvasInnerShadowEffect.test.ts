import { createInnerShadowEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool, InnerShadowEffect } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import {
  applyInnerShadowEffectToCanvas,
  defaultCanvasInnerShadowEffectRunner,
  registerCanvasInnerShadowEffect,
} from './canvasInnerShadowEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Recipe assertions rather than pixels — see canvasBlendEffect.test.ts for why jsdom forces that. Scratch
// targets are pre-seeded into the pool so each pass is identifiable; acquisition pops from the end, so the
// seed order is the reverse of the acquisition order.
function seededPool(ids: readonly string[]): { pool: CanvasRenderTargetPool; targets: CanvasRenderTarget[] } {
  const targets = ids.map((id) => {
    const target = createCanvasRenderTarget(4, 4);
    target.canvas.id = id;
    return target;
  });
  return {
    pool: (() => {
      const out = allocateEntity<unknown>();
      out.creator = canvasTestSurfaceCreator;
      out.free = [...targets].reverse();
      out.inUse = [];
      return finishEntity(out) as unknown;
    })() as CanvasRenderTargetPool,
    targets,
  };
}

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
    vi.spyOn(context, 'fillRect').mockImplementation((() => {
      log.push({ entry: `fill->${into}|${context.globalCompositeOperation}`, dx: 0, dy: 0 });
    }) as typeof context.fillRect);
  }
}

function scene(): { source: CanvasRenderTarget; dest: CanvasRenderTarget } {
  const source = createCanvasRenderTarget(4, 4);
  const dest = createCanvasRenderTarget(4, 4);
  source.canvas.id = 'source';
  dest.canvas.id = 'dest';
  return { source, dest };
}

function innerShadow(over: Partial<InnerShadowEffect> = {}): InnerShadowEffect {
  return createInnerShadowEffect(over);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyInnerShadowEffectToCanvas', () => {
  it('inverts, blurs, offsets, clips to the source, and draws over the source in that order', () => {
    // Angle 0 so the offset is exactly (distance, 0) and the ordering assertion carries no float noise.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'blurred', 'shadow']);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerShadowEffectToCanvas(source, dest, pool, innerShadow({ angle: 0, distance: 4 }));

    expect(log.map((d) => `${d.entry}|${d.dx},${d.dy}`)).toEqual([
      'fill->mask|source-over|0,0',
      'source->mask|destination-out|0,0',
      'mask->blurred|source-over|0,0',
      // Blur first, THEN offset. Offsetting the mask before blurring would smear the shadow
      // symmetrically about the shifted edge and lose the directional falloff entirely.
      'blurred->shadow|source-over|4,0',
      'source->shadow|destination-in|0,0',
      'source->dest|source-over|0,0',
      'shadow->dest|source-over|0,0',
    ]);
  });

  it('converts the angle from degrees when placing the offset', () => {
    // The descriptor is authoring-layer, so its angle is degrees; treating it as radians would put a
    // 90-degree shadow at roughly (-1.7, 3.6) instead of straight down.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'blurred', 'shadow']);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerShadowEffectToCanvas(source, dest, pool, innerShadow({ angle: 90, distance: 4 }));

    const offset = log.find((d) => d.entry.startsWith('blurred->shadow'));
    expect(offset?.dx).toBeCloseTo(0);
    expect(offset?.dy).toBeCloseTo(4);
  });

  it('offsets into a separate target rather than onto the blurred one', () => {
    // Drawing a target onto itself at an offset reads pixels it is concurrently writing. The third
    // scratch target exists for exactly this, so the shift must land somewhere other than `blurred`.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'blurred', 'shadow']);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerShadowEffectToCanvas(source, dest, pool, innerShadow({ angle: 0, distance: 4 }));

    expect(log.some((d) => d.entry === 'blurred->blurred|source-over')).toBe(false);
    expect(log.some((d) => d.entry === 'blurred->shadow|source-over')).toBe(true);
  });

  it('drops the source and keeps only the shadow when sourceMode is hide', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'blurred', 'shadow']);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerShadowEffectToCanvas(source, dest, pool, innerShadow({ sourceMode: 'hide' }));

    expect(log.filter((d) => d.entry.endsWith('->dest|source-over')).map((d) => d.entry)).toEqual([
      'shadow->dest|source-over',
    ]);
  });

  it('draws the shadow once per whole unit of strength', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'blurred', 'shadow']);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerShadowEffectToCanvas(source, dest, pool, innerShadow({ strength: 3 }));

    expect(log.filter((d) => d.entry.startsWith('shadow->dest'))).toHaveLength(3);
  });

  it('returns all three scratch targets to the pool', () => {
    const { source, dest } = scene();
    const { pool } = seededPool(['mask', 'blurred', 'shadow']);

    applyInnerShadowEffectToCanvas(source, dest, pool, innerShadow());

    expect(pool.inUse).toHaveLength(0);
    expect(pool.free).toHaveLength(3);
  });

  it('runs without a caller-supplied pool', () => {
    const { source, dest } = scene();

    expect(() => applyInnerShadowEffectToCanvas(source, dest, innerShadow())).not.toThrow();
  });
});

describe('defaultCanvasInnerShadowEffectRunner', () => {
  it('applies the shadow through the pipeline context', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'blurred', 'shadow']);
    const log: Draw[] = [];
    recordAll(log, [...targets, dest]);

    defaultCanvasInnerShadowEffectRunner({ state, source, dest, pool }, innerShadow());

    expect(log.map((d) => d.entry)).toContain('source->shadow|destination-in');
  });
});

describe('registerCanvasInnerShadowEffect', () => {
  it('registers the default runner under the InnerShadowEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasInnerShadowEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'InnerShadowEffect')).toBe(defaultCanvasInnerShadowEffectRunner);
  });
});
