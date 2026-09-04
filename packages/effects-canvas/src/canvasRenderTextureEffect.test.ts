import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  acquireCanvasRenderTexture,
  createCanvasOffscreenRenderState,
  createCanvasRenderTexturePool,
  createCanvasTextureResolvers,
  getCanvasRenderTextureTarget,
  isCanvasRenderTextureReady,
  writeCanvasRenderTextureTarget,
} from '@flighthq/scene2d-canvas/contract';
import type { CanvasRenderEffectRunner } from '@flighthq/types/contract';

import {
  acquireTestCanvasRenderSurface,
  canvasTestSurfaceCreator,
  createCanvasRenderState,
} from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner, registerCanvasRenderEffect } from './canvasRenderEffectRegistry';
import { applyCanvasRenderEffectsToRenderTexture } from './canvasRenderTextureEffect';

describe('applyCanvasRenderEffectsToRenderTexture', () => {
  it('ping-pongs an even registered chain so the last operation publishes destination', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(canvasTestSurfaceCreator);
    const source = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    writeCanvasRenderTextureTarget(state, source, () => {});
    const first: CanvasRenderEffectRunner = vi.fn();
    const second: CanvasRenderEffectRunner = vi.fn();
    registerCanvasRenderEffect(state, 'acme.First', first);
    registerCanvasRenderEffect(state, 'acme.Second', second);

    expect(
      applyCanvasRenderEffectsToRenderTexture(state, state, pool, source, dest, scratch, [
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
    expect(vi.mocked(first).mock.calls[0][0].dest).toBe(getCanvasRenderTextureTarget(state, scratch));
    expect(vi.mocked(second).mock.calls[0][0].dest).toBe(getCanvasRenderTextureTarget(state, dest));
    expect(isCanvasRenderTextureReady(state, dest)).toBe(true);
  });

  it('leaves destination unpublished when no effect kind is registered', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(canvasTestSurfaceCreator);
    const source = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    writeCanvasRenderTextureTarget(state, source, () => {});

    expect(
      applyCanvasRenderEffectsToRenderTexture(state, state, pool, source, dest, scratch, [
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out);
        })(),
      ]),
    ).toBe(false);
    expect(isCanvasRenderTextureReady(state, dest)).toBe(false);
  });
});

describe('offscreen effect registration policy', () => {
  it('does not copy per-state mutations through a hidden parent link', () => {
    const screen = createCanvasRenderState(document.createElement('canvas'));
    const first: CanvasRenderEffectRunner = vi.fn();
    const later: CanvasRenderEffectRunner = vi.fn();
    registerCanvasRenderEffect(screen, 'acme.First', first);
    const offscreen = createCanvasOffscreenRenderState(
      acquireTestCanvasRenderSurface(),
      screen.pipeline,
      createCanvasTextureResolvers(canvasTestSurfaceCreator),
    );
    registerCanvasRenderEffect(screen, 'acme.Later', later);

    expect(getCanvasRenderEffectRunner(offscreen, 'acme.First')).toBeNull();
    expect(getCanvasRenderEffectRunner(offscreen, 'acme.Later')).toBeNull();
  });
});
