import { createBlurEffect } from '@flighthq/effects/contract';
import {
  acquireWgpuRenderTexture,
  beginWgpuFrame,
  copyWgpuRenderStateRegistrations,
  createWgpuOffscreenRenderState,
  createWgpuRenderStateForTest,
  createWgpuRenderTexturePool,
  getWgpuRenderTextureTarget,
  installWgpuMock,
  isWgpuRenderTextureReady,
  writeWgpuRenderTextureTarget,
} from '@flighthq/render-wgpu/contract';
import type { WgpuRenderEffectRunner } from '@flighthq/types/contract';

import { defaultWgpuBlurEffectRunner } from './wgpuBlurEffect';
import { getWgpuRenderEffectRunner, registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';
import { applyWgpuRenderEffectsToRenderTexture } from './wgpuRenderTextureEffect';

beforeAll(() => installWgpuMock());

describe('applyWgpuRenderEffectsToRenderTexture', () => {
  it('ping-pongs an even registered chain so the last operation publishes destination', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    const first: WgpuRenderEffectRunner = vi.fn();
    const second: WgpuRenderEffectRunner = vi.fn();
    registerWgpuRenderEffect(state, 'acme.First', first);
    registerWgpuRenderEffect(state, 'acme.Second', second);

    expect(
      applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [
        { kind: 'acme.First' },
        { kind: 'acme.Second' },
      ]),
    ).toBe(true);

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(vi.mocked(first).mock.calls[0][0].dest).toBe(getWgpuRenderTextureTarget(state, scratch));
    expect(vi.mocked(second).mock.calls[0][0].dest).toBe(getWgpuRenderTextureTarget(state, dest));
    expect(isWgpuRenderTextureReady(state, dest)).toBe(true);
  });

  it('runs a real multi-pass blur with one released raw scratch target', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 16, height: 12 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 16, height: 12 });
    const scratch = acquireWgpuRenderTexture(state, pool, { width: 16, height: 12 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    registerWgpuRenderEffect(state, 'BlurEffect', defaultWgpuBlurEffectRunner);
    beginWgpuFrame(state);

    expect(
      applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [
        createBlurEffect({ blurX: 2, blurY: 3 }),
      ]),
    ).toBe(true);

    expect(isWgpuRenderTextureReady(state, dest)).toBe(true);
    expect(pool.effectTargets.free).toHaveLength(1);
  });

  it('leaves destination unpublished when no effect kind is registered', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});

    expect(applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [{ kind: 'acme.Missing' }])).toBe(
      false,
    );
    expect(isWgpuRenderTextureReady(state, dest)).toBe(false);
  });
});

describe('offscreen effect registration snapshots', () => {
  it('copies runners at derivation and requires explicit re-copy for later runners', async () => {
    const screen = await createWgpuRenderStateForTest();
    const first: WgpuRenderEffectRunner = vi.fn();
    const later: WgpuRenderEffectRunner = vi.fn();
    registerWgpuRenderEffect(screen, 'acme.First', first);
    const offscreen = createWgpuOffscreenRenderState(screen);
    registerWgpuRenderEffect(screen, 'acme.Later', later);

    expect(getWgpuRenderEffectRunner(offscreen, 'acme.First')).toBe(first);
    expect(getWgpuRenderEffectRunner(offscreen, 'acme.Later')).toBeNull();

    copyWgpuRenderStateRegistrations(offscreen, screen);
    expect(getWgpuRenderEffectRunner(offscreen, 'acme.Later')).toBe(later);
  });
});
