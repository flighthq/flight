import {
  acquireGlRenderTexture,
  clearGlRenderTexture,
  copyGlRenderStateRegistrations,
  createGlOffscreenRenderState,
  createGlRenderState,
  createGlRenderTexturePool,
  getGlRenderTextureTarget,
  isGlRenderTextureReady,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';
import type { GlRenderEffectRunner, GlRenderState, RenderEffect } from '@flighthq/types/contract';

import { applyGaussianBlurToGlRenderTextures } from './glBlurEffect';
import { getGlRenderEffectRunner, registerGlRenderEffect } from './glRenderEffectRegistry';
import {
  applyGlRenderEffectsToRenderTexture,
  explainGlRenderEffectApplication,
  setGlRenderEffectApplicationGuard,
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

describe('applyGlRenderEffectsToRenderTexture', () => {
  it('ping-pongs registered effects so an even chain still finishes in the destination lease', () => {
    const state = createState();
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});
    const first: GlRenderEffectRunner = vi.fn();
    const second: GlRenderEffectRunner = vi.fn();
    registerGlRenderEffect(state, 'acme.First', first);
    registerGlRenderEffect(state, 'acme.Second', second);

    expect(
      applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [
        { kind: 'acme.First' },
        { kind: 'acme.Second' },
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

    expect(applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [{ kind: 'acme.Missing' }])).toBe(
      false,
    );
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
    vi.mocked(state.gl.clear).mockImplementation(() => {
      clearObserved = true;
    });
    registerGlRenderEffect(state, 'test.constant-frame', () => {
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
      expect(applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effect)).toBe(true);
      return Array.from(destinationPixel);
    });

    destinationPixel.fill(0);
    clearObserved = false;
    const accumulatedFrames = Array.from({ length: 4 }, () => {
      expect(applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effect)).toBe(true);
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

describe('explainGlRenderEffectApplication', () => {
  it('separates an empty chain from one whose effects are all unregistered', () => {
    const state = createState();
    // Both return false from the apply path, but only the second is a registration miss.
    expect(explainGlRenderEffectApplication(state, [], true).status).toBe('no-effects');
    expect(explainGlRenderEffectApplication(state, effects(['test.explain-a']), true).status).toBe(
      'unregistered-effects',
    );
  });

  it('reports partial registration, the case that SUCCEEDS while dropping effects', () => {
    const state = createState();
    registerGlRenderEffect(state, 'test.explain-b', () => {});
    const explanation = explainGlRenderEffectApplication(state, effects(['test.explain-b', 'test.explain-c']), true);
    expect(explanation).toEqual({
      registeredCount: 1,
      requestedCount: 2,
      status: 'partial-registration',
      unregisteredKinds: ['test.explain-c'],
    });
  });

  it('blames an unrealized source ahead of registration, since it explains a false return either way', () => {
    const state = createState();
    registerGlRenderEffect(state, 'test.explain-d', () => {});
    expect(explainGlRenderEffectApplication(state, effects(['test.explain-d']), false).status).toBe(
      'source-unavailable',
    );
  });

  it('reports a fully registered chain as complete', () => {
    const state = createState();
    registerGlRenderEffect(state, 'test.explain-e', () => {});
    expect(explainGlRenderEffectApplication(state, effects(['test.explain-e']), true).status).toBe('complete');
  });

  it('reports a ready destination as stale when a failed call cannot replace it', () => {
    const state = createState();
    expect(explainGlRenderEffectApplication(state, effects(['test.explain-f']), true, true).status).toBe(
      'stale-destination',
    );
    registerGlRenderEffect(state, 'test.explain-g', () => {});
    expect(explainGlRenderEffectApplication(state, effects(['test.explain-g']), false, true).status).toBe(
      'stale-destination',
    );
  });
});

function createState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  return createGlRenderState(canvas);
}

describe('offscreen effect registration snapshots', () => {
  it('copies registered runners at derivation and requires explicit re-copy for later runners', () => {
    const screen = createState();
    const first: GlRenderEffectRunner = vi.fn();
    const later: GlRenderEffectRunner = vi.fn();
    registerGlRenderEffect(screen, 'acme.First', first);
    const offscreen = createGlOffscreenRenderState(screen);
    registerGlRenderEffect(screen, 'acme.Later', later);

    expect(getGlRenderEffectRunner(offscreen, 'acme.First')).toBe(first);
    expect(getGlRenderEffectRunner(offscreen, 'acme.Later')).toBeNull();

    copyGlRenderStateRegistrations(offscreen, screen);
    expect(getGlRenderEffectRunner(offscreen, 'acme.Later')).toBe(later);
  });
});

describe('setGlRenderEffectApplicationGuard', () => {
  it('reports only the sentinel outcomes, and stops once cleared', () => {
    const state = createState();
    const seen: string[] = [];
    setGlRenderEffectApplicationGuard(state, (_s, explanation) => seen.push(explanation.status));
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});

    applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effects(['test.guard-a']));
    applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, []);
    expect(seen).toEqual(['unregistered-effects']);

    setGlRenderEffectApplicationGuard(state, null);
    applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effects(['test.guard-b']));
    expect(seen).toEqual(['unregistered-effects']);
  });

  it('reports a previously published destination as stale when no runner can replace it', () => {
    const state = createState();
    const seen: string[] = [];
    setGlRenderEffectApplicationGuard(state, (_s, explanation) => seen.push(explanation.status));
    const pool = createGlRenderTexturePool();
    const source = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireGlRenderTexture(state, pool, { width: 8, height: 8 });
    writeGlRenderTextureTarget(state, source, () => {});
    writeGlRenderTextureTarget(state, dest, () => {});

    expect(applyGlRenderEffectsToRenderTexture(state, pool, source, dest, scratch, effects(['test.guard-stale']))).toBe(
      false,
    );
    expect(seen).toEqual(['stale-destination']);
  });
});

function effects(kinds: readonly string[]): ReadonlyArray<Readonly<RenderEffect>> {
  return kinds.map((kind) => ({ kind }) as unknown as Readonly<RenderEffect>);
}

function compositePremultipliedPixel(destination: Uint8Array, source: Uint8Array): Uint8Array {
  const result = new Uint8Array(4);
  const destinationScale = 1 - source[3] / 255;
  for (let channel = 0; channel < 4; channel++) {
    result[channel] = Math.round(source[channel] + destination[channel] * destinationScale);
  }
  return result;
}
