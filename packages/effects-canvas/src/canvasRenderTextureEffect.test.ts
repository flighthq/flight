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
import type { CanvasEffectRunner } from '@flighthq/types/contract';

import { getCanvasEffectRunner, registerCanvasEffect } from './canvasEffectRegistry';
import {
  acquireTestCanvasRenderSurface,
  canvasTestSurfaceCreator,
  createCanvasRenderState,
} from './canvasEffectTestSupport';
import { applyCanvasEffectsToRenderTexture } from './canvasRenderTextureEffect';

describe('applyCanvasEffectsToRenderTexture', () => {
  it('ping-pongs an even registered chain so the last operation publishes destination', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const pool = createCanvasRenderTexturePool(canvasTestSurfaceCreator);
    const source = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireCanvasRenderTexture(state, pool, { width: 8, height: 8 });
    writeCanvasRenderTextureTarget(state, source, () => {});
    const first: CanvasEffectRunner = vi.fn();
    const second: CanvasEffectRunner = vi.fn();
    registerCanvasEffect(state, 'acme.First', first);
    registerCanvasEffect(state, 'acme.Second', second);

    expect(
      applyCanvasEffectsToRenderTexture(state, state, pool, source, dest, scratch, [
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
      applyCanvasEffectsToRenderTexture(state, state, pool, source, dest, scratch, [
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
    const first: CanvasEffectRunner = vi.fn();
    const later: CanvasEffectRunner = vi.fn();
    registerCanvasEffect(screen, 'acme.First', first);
    const offscreen = createCanvasOffscreenRenderState(
      screen.registries,
      createCanvasTextureResolvers(canvasTestSurfaceCreator),
    );
    registerCanvasEffect(screen, 'acme.Later', later);

    expect(getCanvasEffectRunner(offscreen, 'acme.First')).toBeNull();
    expect(getCanvasEffectRunner(offscreen, 'acme.Later')).toBeNull();
  });
});
