import { createGradientGlowEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CanvasRenderTarget, CanvasRenderTargetPool, GradientGlowEffect } from '@flighthq/types/contract';

import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import {
  applyGradientGlowEffectToCanvas,
  defaultCanvasGradientGlowEffectRunner,
  registerCanvasGradientGlowEffect,
} from './canvasGradientGlowEffect';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Recipe assertions rather than pixels — see canvasBlendEffect.test.ts. Scratch targets are pre-seeded so
// each pass is identifiable; the pool pops from the end, so the seed order reverses the acquire order.
function seededPool(ids: readonly string[]): { pool: CanvasRenderTargetPool; targets: CanvasRenderTarget[] } {
  const targets = ids.map((id) => {
    const target = createCanvasRenderTarget(4, 4);
    target.canvas.id = id;
    return target;
  });
  return {
    pool: (() => {
      const out = allocateEntity<any>();
      out.creator = canvasTestSurfaceCreator;
      out.free = [...targets].reverse();
      out.inUse = [];
      return finishEntity(out) as unknown;
    })() as CanvasRenderTargetPool,
    targets,
  };
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

function effectOf(over: Partial<GradientGlowEffect> = {}): GradientGlowEffect {
  return createGradientGlowEffect({ ...RAMP, ...over });
}

afterEach(() => {
  vi.restoreAllMocks();
});
const SCRATCH = ['blurred', 'glow'];

describe('applyGradientGlowEffectToCanvas', () => {
  it('blurs the silhouette, then draws the glow under the source', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyGradientGlowEffectToCanvas(source, dest, pool, effectOf());

    // Glow first, source over it: this is an OUTER effect, so the shape occludes the glow beneath it.
    // The ramp lookup between them writes via putImageData and so does not appear in a drawImage log.
    expect(log).toEqual(['source->blurred|source-over', 'glow->dest|source-over', 'source->dest|source-over']);
  });

  it('drops the source when sourceMode is hide', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyGradientGlowEffectToCanvas(source, dest, pool, effectOf({ sourceMode: 'hide' }));

    expect(log.filter((e) => e.endsWith('->dest|source-over'))).toEqual(['glow->dest|source-over']);
  });

  it('draws the glow once per whole unit of strength', () => {
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    applyGradientGlowEffectToCanvas(source, dest, pool, effectOf({ strength: 3 }));

    expect(log.filter((e) => e.startsWith('glow->dest'))).toHaveLength(3);
  });

  it('returns both scratch targets to the pool', () => {
    const { source, dest } = scene();
    const { pool } = seededPool(SCRATCH);

    applyGradientGlowEffectToCanvas(source, dest, pool, effectOf());

    expect(pool.inUse).toHaveLength(0);
    expect(pool.free).toHaveLength(SCRATCH.length);
  });

  it('runs without a caller-supplied pool', () => {
    const { source, dest } = scene();

    expect(() => applyGradientGlowEffectToCanvas(source, dest, effectOf())).not.toThrow();
  });
});

describe('defaultCanvasGradientGlowEffectRunner', () => {
  it('applies the glow through the pipeline context', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const { source, dest } = scene();
    const { pool, targets } = seededPool(SCRATCH);
    const log: string[] = [];
    recordAll(log, [...targets, dest]);

    defaultCanvasGradientGlowEffectRunner({ state, source, dest, pool }, effectOf());

    expect(log).toContain('glow->dest|source-over');
  });
});

describe('registerCanvasGradientGlowEffect', () => {
  it('registers the default runner under the GradientGlowEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasGradientGlowEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'GradientGlowEffect')).toBe(defaultCanvasGradientGlowEffectRunner);
  });
});
