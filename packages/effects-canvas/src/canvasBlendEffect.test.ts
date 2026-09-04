import { createBlendEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  BlendEffect,
  CanvasRenderState,
  CanvasRenderTarget,
  CanvasRenderTargetPool,
} from '@flighthq/types/contract';

import {
  applyBlendEffectToCanvas,
  defaultCanvasBlendEffectRunner,
  getCanvasBlendEffectBackdrop,
  getCanvasBlendEffectCompositeOperation,
  registerCanvasBlendEffect,
  registerCanvasBlendEffectBackdrop,
  unregisterCanvasBlendEffectBackdrop,
} from './canvasBlendEffect';
import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// These tests assert the DRAW CONTRACT, not pixels, and that is deliberate rather than a shortcut.
// jsdom's 2D context accepts every call and every globalCompositeOperation but rasterizes nothing — a
// fillRect followed by getImageData reads back transparent black — so a pixel assertion here would
// either pass vacuously or fail for a reason that has nothing to do with the effect. What IS verifiable
// in this environment is the sequence of operations the recipe issues, which carries the substantive
// claims: that the backdrop is laid down before the layer (every non-commutative mode gives a different
// image if that order flips), that the mode maps to the right native operation, and that opacity reaches
// globalAlpha. Real pixels belong to the functional/browser suite.
function recordDraws(target: Readonly<CanvasRenderTarget>): string[] {
  const drawn: string[] = [];
  const context = target.context;
  vi.spyOn(context, 'drawImage').mockImplementation(((image: CanvasImageSource) => {
    // Captured at call time, because the recipe changes both between the two draws.
    drawn.push(
      `${(image as HTMLCanvasElement).id || 'canvas'}|${context.globalCompositeOperation}|${context.globalAlpha}`,
    );
  }) as typeof context.drawImage);
  return drawn;
}

function scene(): { state: CanvasRenderState; source: CanvasRenderTarget; dest: CanvasRenderTarget } {
  const state = createCanvasRenderState(document.createElement('canvas'));
  const source = createCanvasRenderTarget(4, 4);
  const dest = createCanvasRenderTarget(4, 4);
  source.canvas.id = 'source';
  dest.canvas.id = 'dest';
  return { state, source, dest };
}

function backdropTarget(): CanvasRenderTarget {
  const backdrop = createCanvasRenderTarget(4, 4);
  backdrop.canvas.id = 'backdrop';
  return backdrop;
}

function blendEffect(over: Partial<BlendEffect> = {}): BlendEffect {
  return createBlendEffect('Overlay', over);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyBlendEffectToCanvas', () => {
  it('draws the backdrop first and then the layer under the named mode', () => {
    const { state, source, dest } = scene();
    const backdrop = backdropTarget();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdrop);
    const drawn = recordDraws(dest);

    applyBlendEffectToCanvas(state, source, dest, blendEffect({ mode: 'Overlay', backdropKey: 'scene' }));

    // Order is the assertion. The backdrop is the destination the mode reads, so it must already be in
    // dest when the layer lands; drawn the other way round every non-commutative mode blends backwards.
    expect(drawn).toEqual(['backdrop|source-over|1', 'source|overlay|1']);
  });

  it('scales the layer with globalAlpha when the effect carries an opacity', () => {
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);

    applyBlendEffectToCanvas(state, source, dest, blendEffect({ backdropKey: 'scene', opacity: 0.25 }));

    // Only the layer is scaled — the backdrop is the destination and must go down at full strength.
    expect(drawn).toEqual(['backdrop|source-over|1', 'source|overlay|0.25']);
  });

  it('passes the layer through unblended when the named backdrop is not registered', () => {
    const { state, source, dest } = scene();
    const drawn = recordDraws(dest);

    applyBlendEffectToCanvas(state, source, dest, blendEffect({ backdropKey: 'absent' }));

    // One draw, source-over: an unregistered key blends over an implicit transparent backdrop, which
    // reduces to a passthrough. Matches the GL contract, which gates its second sampler the same way.
    expect(drawn).toEqual(['source|source-over|1']);
  });

  it('passes the layer through unblended when the effect names no backdrop at all', () => {
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);

    applyBlendEffectToCanvas(state, source, dest, blendEffect());

    // A registered backdrop the effect does not name must not be picked up implicitly.
    expect(drawn).toEqual(['source|source-over|1']);
  });
});

describe('defaultCanvasBlendEffectRunner', () => {
  it('applies the blend through the pipeline context', () => {
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);

    defaultCanvasBlendEffectRunner(
      {
        state,
        source,
        dest,
        pool: (() => {
          const out = allocateEntity<any>();
          out.creator = canvasTestSurfaceCreator;
          out.free = [];
          out.inUse = [];
          return finishEntity(out) as unknown;
        })() as CanvasRenderTargetPool,
      },
      blendEffect({ mode: 'Screen', backdropKey: 'scene' }),
    );

    // 'Screen' is NOT an AdvancedBlendMode — it is in the fixed-function BlendMode enum — so it has no
    // entry here and must fall back rather than reach a native 'screen' operation by coincidence.
    expect(drawn).toEqual(['backdrop|source-over|1', 'source|source-over|1']);
  });
});

describe('getCanvasBlendEffectBackdrop', () => {
  it('returns the registered target for its key', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const backdrop = backdropTarget();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdrop);

    expect(getCanvasBlendEffectBackdrop(state, 'scene')).toBe(backdrop);
  });

  it('returns null for an unregistered key and for a null key', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());

    expect(getCanvasBlendEffectBackdrop(state, 'other')).toBe(null);
    expect(getCanvasBlendEffectBackdrop(state, null)).toBe(null);
  });

  it('returns null before anything has been registered on the state', () => {
    // The registry slot is absent until first use, so the query must not assume a map exists.
    const state = createCanvasRenderState(document.createElement('canvas'));

    expect(getCanvasBlendEffectBackdrop(state, 'scene')).toBe(null);
  });

  it('keeps backdrops separate per render state', () => {
    const first = createCanvasRenderState(document.createElement('canvas'));
    const second = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlendEffectBackdrop(first, 'scene', backdropTarget());

    expect(getCanvasBlendEffectBackdrop(second, 'scene')).toBe(null);
  });
});

describe('getCanvasBlendEffectCompositeOperation', () => {
  it('maps every AdvancedBlendMode to a native operation', () => {
    // All eleven, including the four non-separable HSL modes, which is the reason Canvas needs no blend
    // math of its own. A mode missing from the table would silently become a passthrough.
    expect(
      [
        'Color',
        'ColorBurn',
        'ColorDodge',
        'Difference',
        'Exclusion',
        'HardLight',
        'Hue',
        'Luminosity',
        'Overlay',
        'Saturation',
        'SoftLight',
      ].map(getCanvasBlendEffectCompositeOperation),
    ).toEqual([
      'color',
      'color-burn',
      'color-dodge',
      'difference',
      'exclusion',
      'hard-light',
      'hue',
      'luminosity',
      'overlay',
      'saturation',
      'soft-light',
    ]);
  });

  it('falls back to source-over for a mode it does not know', () => {
    expect(getCanvasBlendEffectCompositeOperation('acme.Sparkle')).toBe('source-over');
  });
});

describe('registerCanvasBlendEffect', () => {
  it('registers the default runner under the BlendEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlendEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'BlendEffect')).toBe(defaultCanvasBlendEffectRunner);
  });
});

describe('registerCanvasBlendEffectBackdrop', () => {
  it('replaces the target already held under the same key', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const replacement = backdropTarget();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    registerCanvasBlendEffectBackdrop(state, 'scene', replacement);

    expect(getCanvasBlendEffectBackdrop(state, 'scene')).toBe(replacement);
  });
});

describe('unregisterCanvasBlendEffectBackdrop', () => {
  it('drops the registered target and reports that one was present', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());

    expect(unregisterCanvasBlendEffectBackdrop(state, 'scene')).toBe(true);
    expect(getCanvasBlendEffectBackdrop(state, 'scene')).toBe(null);
  });

  it('reports false for a key that was never registered', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());

    expect(unregisterCanvasBlendEffectBackdrop(state, 'other')).toBe(false);
  });

  it('reports false before anything has been registered on the state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    expect(unregisterCanvasBlendEffectBackdrop(state, 'scene')).toBe(false);
  });
});
