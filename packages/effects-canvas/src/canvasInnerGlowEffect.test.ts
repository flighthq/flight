import { createInnerGlowEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool, InnerGlowEffect } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import {
  applyInnerGlowEffectToCanvas,
  defaultCanvasInnerGlowEffectRunner,
  registerCanvasInnerGlowEffect,
} from './canvasInnerGlowEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Recipe assertions rather than pixels, for the reason in canvasBlendEffect.test.ts: jsdom's 2D context
// rasterizes nothing. The scratch targets are pre-seeded into the pool so each one is identifiable by id,
// which turns "the right multi-pass recipe ran" into an assertion instead of a hope. Pool acquisition
// pops from the end, so the seed order is the reverse of the acquisition order.
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

// One transcript across every target, so ordering between passes is visible and not just within one.
function recordAll(log: string[], targets: readonly Readonly<CanvasRenderTarget>[]): void {
  for (const target of targets) {
    const context = target.context;
    const into = target.canvas.id;
    vi.spyOn(context, 'drawImage').mockImplementation(((image: CanvasImageSource, dx?: number, dy?: number) => {
      const from = (image as HTMLCanvasElement).id || 'canvas';
      log.push(`${from}->${into}|${context.globalCompositeOperation}|${dx ?? 0},${dy ?? 0}`);
    }) as typeof context.drawImage);
    vi.spyOn(context, 'fillRect').mockImplementation((() => {
      log.push(`fill->${into}|${context.globalCompositeOperation}`);
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

function innerGlow(over: Partial<InnerGlowEffect> = {}): InnerGlowEffect {
  return createInnerGlowEffect(over);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyInnerGlowEffectToCanvas', () => {
  it('inverts the silhouette, blurs it, clips it back to the source, and draws it over the source', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'glow']);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerGlowEffectToCanvas(source, dest, pool, innerGlow());

    expect(log).toEqual([
      // Inversion: fill the whole target with the tint, then knock the silhouette out of it.
      'fill->mask|source-over',
      'source->mask|destination-out|0,0',
      // Blur the inversion so it carries inward across the boundary.
      'mask->glow|source-over|0,0',
      // Clip back to the shape, discarding everything that never made it inside.
      'source->glow|destination-in|0,0',
      // Source first, glow over it — an inner effect sits ON the shape.
      'source->dest|source-over|0,0',
      'glow->dest|source-over|0,0',
    ]);
  });

  it('drops the source and keeps only the glow when sourceMode is hide', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'glow']);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerGlowEffectToCanvas(source, dest, pool, innerGlow({ sourceMode: 'hide' }));

    expect(log.filter((entry) => entry.endsWith('->dest|source-over|0,0'))).toEqual(['glow->dest|source-over|0,0']);
  });

  it('draws the glow once per whole unit of strength', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'glow']);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerGlowEffectToCanvas(source, dest, pool, innerGlow({ strength: 3 }));

    expect(log.filter((entry) => entry.startsWith('glow->dest'))).toHaveLength(3);
  });

  it('still draws the glow once for a fractional strength below one', () => {
    // Math.floor would give zero passes and silently drop the effect; the floor is clamped to one so a
    // partial strength weakens the tint rather than removing the glow.
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'glow']);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyInnerGlowEffectToCanvas(source, dest, pool, innerGlow({ strength: 0.5 }));

    expect(log.filter((entry) => entry.startsWith('glow->dest'))).toHaveLength(1);
  });

  it('returns both scratch targets to the pool', () => {
    // Every acquire must be matched by a release, or the pool grows a target per frame forever.
    const { source, dest } = scene();
    const { pool } = seededPool(['mask', 'glow']);

    applyInnerGlowEffectToCanvas(source, dest, pool, innerGlow());

    expect(pool.inUse).toHaveLength(0);
    expect(pool.free).toHaveLength(2);
  });

  it('runs without a caller-supplied pool', () => {
    const { source, dest } = scene();

    expect(() => applyInnerGlowEffectToCanvas(source, dest, innerGlow())).not.toThrow();
  });
});

describe('defaultCanvasInnerGlowEffectRunner', () => {
  it('applies the glow through the pipeline context', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const { source, dest } = scene();
    const { pool, targets } = seededPool(['mask', 'glow']);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    defaultCanvasInnerGlowEffectRunner({ state, source, dest, pool }, innerGlow());

    expect(log).toContain('source->glow|destination-in|0,0');
  });
});

describe('registerCanvasInnerGlowEffect', () => {
  it('registers the default runner under the InnerGlowEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasInnerGlowEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'InnerGlowEffect')).toBe(defaultCanvasInnerGlowEffectRunner);
  });
});
