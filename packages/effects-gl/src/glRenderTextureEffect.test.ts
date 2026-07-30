import {
  acquireGlRenderTexture,
  copyGlRenderStateRegistrations,
  createGlOffscreenRenderState,
  createGlRenderState,
  createGlRenderTexturePool,
  getGlRenderTextureTarget,
  isGlRenderTextureReady,
  writeGlRenderTextureTarget,
} from '@flighthq/render-gl/contract';
import type { GlRenderEffectRunner, GlRenderState } from '@flighthq/types/contract';

import { applyGaussianBlurToGlRenderTextures } from './glBlurEffect';
import { getGlRenderEffectRunner, registerGlRenderEffect } from './glRenderEffectRegistry';
import { applyGlRenderEffectsToRenderTexture } from './glRenderTextureEffect';

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
});

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

function createState(): GlRenderState {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  return createGlRenderState(canvas);
}
