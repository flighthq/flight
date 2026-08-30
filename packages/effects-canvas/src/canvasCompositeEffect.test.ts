import type { CanvasRenderState, CanvasRenderTarget, CompositeEffect } from '@flighthq/types/contract';

import { registerCanvasBlendEffectBackdrop } from './canvasBlendEffect';
import {
  applyCompositeEffectToCanvas,
  defaultCanvasCompositeEffectRunner,
  getCanvasCompositeEffectOperation,
  registerCanvasCompositeEffect,
} from './canvasCompositeEffect';
import { canvasTestSurfaceCreator, createCanvasRenderState, createCanvasRenderTarget } from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

// Draw-contract assertions rather than pixels, for the reason spelled out in canvasBlendEffect.test.ts:
// jsdom's 2D context accepts every call and rasterizes nothing, so a pixel assertion would pass
// vacuously. What is verifiable — and what carries the correctness claims — is which images are drawn,
// in what order, and under which globalCompositeOperation.
function recordDraws(target: Readonly<CanvasRenderTarget>): string[] {
  const drawn: string[] = [];
  const context = target.context;
  vi.spyOn(context, 'drawImage').mockImplementation(((image: CanvasImageSource) => {
    drawn.push(`${(image as HTMLCanvasElement).id || 'canvas'}|${context.globalCompositeOperation}`);
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

function compositeEffect(over: Partial<CompositeEffect> = {}): CompositeEffect {
  return { kind: 'CompositeEffect', operator: 'SourceOver', ...over } as CompositeEffect;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyCompositeEffectToCanvas', () => {
  it('draws the backdrop first and then the layer under the named operator', () => {
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);

    applyCompositeEffectToCanvas(
      state,
      source,
      dest,
      compositeEffect({ operator: 'DestinationOut', backdropKey: 'scene' }),
    );

    // The backdrop is the destination every Porter-Duff operator is defined against, so it must be in
    // the target before the layer lands. DestinationOut is the classic erase: reversing the order would
    // punch the hole in the wrong image.
    expect(drawn).toEqual(['backdrop|source-over', 'source|destination-out']);
  });

  it('composites against a transparent destination when the named backdrop is not registered', () => {
    const { state, source, dest } = scene();
    const drawn = recordDraws(dest);

    applyCompositeEffectToCanvas(state, source, dest, compositeEffect({ operator: 'SourceIn', backdropKey: 'absent' }));

    // Still draws, and still under SourceIn — an absent backdrop is a transparent DESTINATION, not a
    // reason to skip the composite. SourceIn against zero coverage correctly yields nothing, which is
    // the operator doing its job rather than a fallback.
    expect(drawn).toEqual(['source|source-in']);
  });

  it('reads no backdrop the effect has not named', () => {
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);

    applyCompositeEffectToCanvas(state, source, dest, compositeEffect());

    expect(drawn).toEqual(['source|source-over']);
  });

  it('shares the backdrop registry with BlendEffect rather than keeping its own', () => {
    // Registered through the Blend entry point and read by the Composite pass, which is the GL contract:
    // both effects resolve their backdrop through the same per-state registry.
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'shared', backdropTarget());
    const drawn = recordDraws(dest);

    applyCompositeEffectToCanvas(state, source, dest, compositeEffect({ operator: 'Xor', backdropKey: 'shared' }));

    expect(drawn).toEqual(['backdrop|source-over', 'source|xor']);
  });

  it('draws neither input for Clear, even with a backdrop registered', () => {
    // Clear means both coverage factors are zero, so the cleared target IS the result. Drawing the
    // backdrop first and only skipping the layer would leave the backdrop showing through.
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);
    const cleared = vi.spyOn(dest.context, 'clearRect');

    applyCompositeEffectToCanvas(state, source, dest, compositeEffect({ operator: 'Clear', backdropKey: 'scene' }));

    expect(drawn).toEqual([]);
    expect(cleared).toHaveBeenCalledWith(0, 0, 4, 4);
  });
});

describe('defaultCanvasCompositeEffectRunner', () => {
  it('applies the composite through the pipeline context', () => {
    const { state, source, dest } = scene();
    registerCanvasBlendEffectBackdrop(state, 'scene', backdropTarget());
    const drawn = recordDraws(dest);

    defaultCanvasCompositeEffectRunner(
      { state, source, dest, pool: { creator: canvasTestSurfaceCreator, free: [], inUse: [] } },
      compositeEffect({ operator: 'DestinationOver', backdropKey: 'scene' }),
    );

    expect(drawn).toEqual(['backdrop|source-over', 'source|destination-over']);
  });
});

describe('getCanvasCompositeEffectOperation', () => {
  it('maps every operator Canvas realizes natively', () => {
    // Ten of the eleven. Canvas 2D owns this vocabulary, so each is a direct rename of the same
    // Porter-Duff term; a missing entry would silently become SourceOver and composite the wrong way.
    expect(
      [
        'Copy',
        'DestinationAtop',
        'DestinationIn',
        'DestinationOut',
        'DestinationOver',
        'SourceAtop',
        'SourceIn',
        'SourceOut',
        'SourceOver',
        'Xor',
      ].map(getCanvasCompositeEffectOperation),
    ).toEqual([
      'copy',
      'destination-atop',
      'destination-in',
      'destination-out',
      'destination-over',
      'source-atop',
      'source-in',
      'source-out',
      'source-over',
      'xor',
    ]);
  });

  it('falls back to source-over for an operator it does not know', () => {
    expect(getCanvasCompositeEffectOperation('acme.Dissolve')).toBe('source-over');
  });

  it('has no entry for Clear, which the pass handles by clearing instead', () => {
    // Pinned so that "adding the missing Clear entry" cannot look like a fix: Canvas has no 'clear'
    // operation, and an entry here would route Clear into a draw the operator is defined not to make.
    expect(getCanvasCompositeEffectOperation('Clear')).toBe('source-over');
  });
});

describe('registerCanvasCompositeEffect', () => {
  it('registers the default runner under the CompositeEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasCompositeEffect(state);

    expect(getCanvasRenderEffectRunner(state, 'CompositeEffect')).toBe(defaultCanvasCompositeEffectRunner);
  });
});
