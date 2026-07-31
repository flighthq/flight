import {
  acquireCanvasRenderTexture,
  createCanvasOffscreenRenderState,
  createCanvasRenderState,
  createCanvasRenderTexturePool,
  copyCanvasRenderStateRegistrations,
  getCanvasRenderTextureTarget,
  isCanvasRenderTextureReady,
  writeCanvasRenderTextureTarget,
} from '@flighthq/scene2d-canvas/contract';
import type { CanvasRenderEffectRunner } from '@flighthq/types/contract';

import { getCanvasRenderEffectRunner, registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import { applyCanvasRenderEffectsToRenderTexture } from './canvasRenderTextureEffect';

describe('applyCanvasRenderEffectsToRenderTexture', () => {
  it('ping-pongs an even registered chain so the last operation publishes destination', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool();
    const source = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    writeCanvasRenderTextureTarget(state, source, () => {});
    const first: CanvasRenderEffectRunner = vi.fn();
    const second: CanvasRenderEffectRunner = vi.fn();
    registerCanvasRenderEffect(state, 'acme.First', first);
    registerCanvasRenderEffect(state, 'acme.Second', second);

    expect(
      applyCanvasRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [
        { kind: 'acme.First' },
        { kind: 'acme.Second' },
      ]),
    ).toBe(true);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(vi.mocked(first).mock.calls[0][0].dest).toBe(getCanvasRenderTextureTarget(state, scratch));
    expect(vi.mocked(second).mock.calls[0][0].dest).toBe(getCanvasRenderTextureTarget(state, dest));
    expect(isCanvasRenderTextureReady(state, dest)).toBe(true);
  });

  it('leaves destination unpublished when no effect kind is registered', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool();
    const source = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    writeCanvasRenderTextureTarget(state, source, () => {});

    expect(
      applyCanvasRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [{ kind: 'acme.Missing' }]),
    ).toBe(false);
    expect(isCanvasRenderTextureReady(state, dest)).toBe(false);
  });
});

describe('offscreen effect registration snapshots', () => {
  it('copies runners at derivation and requires explicit re-copy for later runners', () => {
    const screen = createCanvasRenderState(document.createElement('canvas'));
    const first: CanvasRenderEffectRunner = vi.fn();
    const later: CanvasRenderEffectRunner = vi.fn();
    registerCanvasRenderEffect(screen, 'acme.First', first);
    const offscreen = createCanvasOffscreenRenderState(screen);
    registerCanvasRenderEffect(screen, 'acme.Later', later);

    expect(getCanvasRenderEffectRunner(offscreen, 'acme.First')).toBe(first);
    expect(getCanvasRenderEffectRunner(offscreen, 'acme.Later')).toBeNull();

    copyCanvasRenderStateRegistrations(offscreen, screen);
    expect(getCanvasRenderEffectRunner(offscreen, 'acme.Later')).toBe(later);
  });
});
