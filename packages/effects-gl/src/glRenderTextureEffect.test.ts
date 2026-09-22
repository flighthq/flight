import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createWebGlContext } from '@flighthq/host-web/contract';
import {
  acquireGlRenderTexture,
  clearGlRenderTexture,
  createGlRenderState,
  createGlRenderTexturePool,
  getGlRenderStateRuntime,
  getGlRenderTextureTarget,
  isGlRenderTextureReady,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';
import type { GlEffectRunner, GlRenderState, Effect } from '@flighthq/types/contract';

import { applyGaussianBlurToGlRenderTextures } from './glBlurEffect';
import { getGlEffectRunner, registerGlEffect } from './glEffectRegistry';
import {
  applyGlEffectsToRenderTexture,
  explainGlEffectApplication,
  setGlEffectApplicationGuard,
} from './glRenderTextureEffect';

describe('applyGaussianBlurToGlRenderTextures', () => {
  it('publishes destination and scratch RenderTextures after the two Gaussian target passes', () => {
    const state = createState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    const dest = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 16, height: 12 });
    writeGlRenderTextureTarget(state, source, () => {});

    expect(applyGaussianBlurToGlRenderTextures(state, source, dest, scratch, { blurX: 2, blurY: 3 })).toBe(true);
    expect(isGlRenderTextureReady(state, dest)).toBe(true);
    expect(isGlRenderTextureReady(state, scratch)).toBe(true);
    expect(dest.version).toBe(1);
    expect(scratch.version).toBe(1);
  });
});

describe('applyGlEffectsToRenderTexture', () => {
  it('ping-pongs registered effects so an even chain still finishes in the destination lease', () => {
    const state = createState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});
    const first: GlEffectRunner = vi.fn();
    const second: GlEffectRunner = vi.fn();
    registerGlEffect(state, 'acme.First', first);
    registerGlEffect(state, 'acme.Second', second);

    expect(
      applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, [
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.First';
          return finishEntity(out);
        })(),
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Second';
          return finishEntity(out);
        })(),
      ]),
    ).toBe(true);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(vi.mocked(first).mock.calls[0][0].dest).toBe(getGlRenderTextureTarget(state, scratch));
    expect(vi.mocked(second).mock.calls[0][0].dest).toBe(getGlRenderTextureTarget(state, dest));
    expect(isGlRenderTextureReady(state, dest)).toBe(true);
  });

  it('leaves the destination unpublished when no effect kind is registered', () => {
    const state = createState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});

    expect(
      applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, [
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out);
        })(),
      ]),
    ).toBe(false);
    expect(isGlRenderTextureReady(state, dest)).toBe(false);
  });

  it('is byte-stable across constant-input frames only when reused destinations are cleared', () => {
    const state = createState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 1, height: 1 });
    const dest = acquireGlRenderTexture(state, pool, { width: 1, height: 1 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 1, height: 1 });
    const constantSource = Uint8Array.from([64, 32, 16, 128]);
    let destinationPixel: Uint8Array = new Uint8Array(4);
    let clearObserved = false;
    vi.mocked(state.gl.clearBufferfv).mockImplementation(() => {
      clearObserved = true;
    });
    registerGlEffect(state, 'test.constant-frame', () => {
      if (clearObserved) {
        destinationPixel.fill(0);
        clearObserved = false;
      }
      destinationPixel = compositePremultipliedPixel(destinationPixel, constantSource);
    });
    writeGlRenderTextureTarget(state, source, () => {});
    const effect = effects(['test.constant-frame']);

    const clearedFrames = Array.from({ length: 4 }, () => {
      clearGlRenderTexture(state, dest);
      expect(applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, effect)).toBe(true);
      return Array.from(destinationPixel);
    });

    destinationPixel.fill(0);
    clearObserved = false;
    const accumulatedFrames = Array.from({ length: 4 }, () => {
      expect(applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, effect)).toBe(true);
      return Array.from(destinationPixel);
    });

    expect(clearedFrames).toEqual(Array.from({ length: 4 }, () => [64, 32, 16, 128]));
    expect(accumulatedFrames).toEqual([
      [64, 32, 16, 128],
      [96, 48, 24, 192],
      [112, 56, 28, 224],
      [120, 60, 30, 240],
    ]);
  });
});

describe('explainGlEffectApplication', () => {
  it('separates an empty chain from one whose effects are all unregistered', () => {
    const state = createState();
    // Both return false from the apply path, but only the second is a registration miss.
    expect(explainGlEffectApplication(state, [], true).status).toBe('no-effects');
    expect(explainGlEffectApplication(state, effects(['test.explain-a']), true).status).toBe('unregistered-effects');
  });

  it('reports partial registration, the case that SUCCEEDS while dropping effects', () => {
    const state = createState();
    registerGlEffect(state, 'test.explain-b', () => {});
    const explanation = explainGlEffectApplication(state, effects(['test.explain-b', 'test.explain-c']), true);
    expect(explanation).toEqual({
      registeredCount: 1,
      requestedCount: 2,
      status: 'partial-registration',
      unregisteredKinds: ['test.explain-c'],
      unresolvedIndexes: [],
    });
  });

  it('blames an unrealized source ahead of registration, since it explains a false return either way', () => {
    const state = createState();
    registerGlEffect(state, 'test.explain-d', () => {});
    expect(explainGlEffectApplication(state, effects(['test.explain-d']), false).status).toBe('source-unavailable');
  });

  it('reports a fully registered chain as complete', () => {
    const state = createState();
    registerGlEffect(state, 'test.explain-e', () => {});
    expect(explainGlEffectApplication(state, effects(['test.explain-e']), true).status).toBe('complete');
  });

  it('reports an effect whose runner cannot resolve it, which PASSES THROUGH rather than dropping', () => {
    const state = createState();
    // Registered, so nothing is missing at the kind level — the runner simply has nothing to run with.
    registerGlEffect(
      state,
      'test.explain-h',
      () => {},
      () => false,
    );
    const explanation = explainGlEffectApplication(state, effects(['test.explain-h']), true);
    expect(explanation.status).toBe('unresolved-effects');
    // Registration is clean; the failure is entirely on the resolution axis.
    expect(explanation.registeredCount).toBe(1);
    expect(explanation.unregisteredKinds).toEqual([]);
    expect(explanation.unresolvedIndexes).toEqual([0]);
  });

  it('distinguishes two effects of the SAME KIND, one resolvable and one not', () => {
    const state = createState();
    // The case a kind-keyed answer gets wrong: both effects share a kind, so any per-kind verdict must
    // report both or neither. Resolution is per instance, and the report has to say WHICH instance.
    registerGlEffect(
      state,
      'test.explain-i',
      () => {},
      (_state, effect) => (effect as unknown as { shaderKey: string }).shaderKey === 'present',
    );
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.explain-i';
        out.shaderKey = 'present';
        return finishEntity(out);
      })(),
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.explain-i';
        out.shaderKey = 'absent';
        return finishEntity(out);
      })(),
    ];
    const explanation = explainGlEffectApplication(state, chain as unknown as ReadonlyArray<Readonly<Effect>>, true);
    expect(explanation.status).toBe('partial-resolution');
    expect(explanation.unresolvedIndexes).toEqual([1]);
    // Not 'unresolved-effects': one stage really runs, so the chain is short one stage, not inert.
    expect(explanation.registeredCount).toBe(2);
  });

  it('blames registration ahead of resolution while still naming the passthroughs', () => {
    const state = createState();
    registerGlEffect(
      state,
      'test.explain-j',
      () => {},
      () => false,
    );
    const explanation = explainGlEffectApplication(state, effects(['test.explain-j', 'test.explain-k']), true);
    // Registering the missing kind has to happen first, but the passthrough is not lost from the report.
    expect(explanation.status).toBe('partial-registration');
    expect(explanation.unresolvedIndexes).toEqual([0]);
  });

  it('reports a ready destination as stale when a failed call cannot replace it', () => {
    const state = createState();
    expect(explainGlEffectApplication(state, effects(['test.explain-f']), true, true).status).toBe('stale-destination');
    registerGlEffect(state, 'test.explain-g', () => {});
    expect(explainGlEffectApplication(state, effects(['test.explain-g']), false, true).status).toBe(
      'stale-destination',
    );
  });
});

function createState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  return createGlRenderState(createWebGlContext(canvas));
}

describe('offscreen effect registration snapshots', () => {
  it('captures registered runners in a rebuilt pipeline without observing later replacements', () => {
    const screen = createState();
    const first: GlEffectRunner = vi.fn();
    const later: GlEffectRunner = vi.fn();
    registerGlEffect(screen, 'acme.First', first);
    const offscreen = createGlRenderState(screen.gl, { ...getGlRenderStateRuntime(screen).registries });
    registerGlEffect(screen, 'acme.Later', later);

    expect(getGlEffectRunner(offscreen, 'acme.First')).toBe(first);
    expect(getGlEffectRunner(offscreen, 'acme.Later')).toBeNull();

    const rebuilt = createGlRenderState(screen.gl, { ...getGlRenderStateRuntime(screen).registries });
    expect(getGlEffectRunner(rebuilt, 'acme.Later')).toBe(later);
  });
});

describe('setGlEffectApplicationGuard', () => {
  it('reports only the sentinel outcomes, and stops once cleared', () => {
    const state = createState();
    const seen: string[] = [];
    setGlEffectApplicationGuard(state, (_s, explanation) => seen.push(explanation.status));
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});

    applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, effects(['test.guard-a']));
    applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, []);
    expect(seen).toEqual(['unregistered-effects']);

    setGlEffectApplicationGuard(state, null);
    applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, effects(['test.guard-b']));
    expect(seen).toEqual(['unregistered-effects']);
  });

  it('reports a previously published destination as stale when no runner can replace it', () => {
    const state = createState();
    const seen: string[] = [];
    setGlEffectApplicationGuard(state, (_s, explanation) => seen.push(explanation.status));
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});
    writeGlRenderTextureTarget(state, dest, () => {});

    expect(applyGlEffectsToRenderTexture(state, pool, source, dest, scratch, effects(['test.guard-stale']))).toBe(
      false,
    );
    expect(seen).toEqual(['stale-destination']);
  });
});

function effects(kinds: readonly string[]): ReadonlyArray<Readonly<Effect>> {
  return kinds.map(
    (kind) =>
      (() => {
        const out = allocateEntity<any>();
        out.kind = kind;
        return finishEntity(out) as unknown;
      })() as Readonly<Effect>,
  );
}

function compositePremultipliedPixel(destination: Uint8Array, source: Uint8Array): Uint8Array {
  const result = new Uint8Array(4);
  const destinationScale = 1 - source[3] / 255;
  for (let channel = 0; channel < 4; channel++) {
    result[channel] = Math.round(source[channel] + destination[channel] * destinationScale);
  }
  return result;
}
