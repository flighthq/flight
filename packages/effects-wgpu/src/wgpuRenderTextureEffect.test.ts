import { createBlurEffect } from '@flighthq/effects/contract';
import { createEntity } from '@flighthq/entity/contract';
import {
  acquireWgpuRenderTexture,
  beginWgpuFrame,
  createWgpuOffscreenRenderState,
  createWgpuPipeline,
  createWgpuRenderStateForTest,
  createWgpuRenderTexturePool,
  getWgpuRenderStateRuntime,
  getWgpuRenderTextureTarget,
  installWgpuMock,
  isWgpuRenderTextureReady,
  writeWgpuRenderTextureTarget,
} from '@flighthq/render-wgpu/contract';
import type { RenderEffect, WgpuRenderEffectRunner } from '@flighthq/types/contract';

import { defaultWgpuBlurEffectRunner } from './wgpuBlurEffect';
import { getWgpuRenderEffectRunner, registerWgpuRenderEffect } from './wgpuRenderEffectRegistry';
import {
  applyWgpuRenderEffectsToRenderTexture,
  explainWgpuRenderEffectApplication,
  setWgpuRenderEffectApplicationGuard,
} from './wgpuRenderTextureEffect';

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
        createEntity({ kind: 'acme.First' }),
        createEntity({ kind: 'acme.Second' }),
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

    expect(
      applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, [
        createEntity({ kind: 'acme.Missing' }),
      ]),
    ).toBe(false);
    expect(isWgpuRenderTextureReady(state, dest)).toBe(false);
  });
});

describe('explainWgpuRenderEffectApplication', () => {
  it('names the unregistered kinds and the status, as plain data with no message text', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    registerWgpuRenderEffect(state, 'test.explain-registered', (() => {}) as WgpuRenderEffectRunner);

    const explanation = explainWgpuRenderEffectApplication(state, source, dest, [
      createEntity({ kind: 'test.explain-registered' }),
      createEntity({ kind: 'test.explain-missing' }),
    ] as unknown as Readonly<RenderEffect>[]);

    expect(explanation).toMatchObject({
      registeredCount: 1,
      requestedCount: 2,
      status: 'partial-registration',
      unregisteredKinds: ['test.explain-missing'],
      unresolvedIndexes: [],
    });
  });

  it('names a registered effect whose instance cannot resolve', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    registerWgpuRenderEffect(state, 'test.explain-unresolved', vi.fn(), () => false);

    expect(
      explainWgpuRenderEffectApplication(state, source, dest, [createEntity({ kind: 'test.explain-unresolved' })]),
    ).toMatchObject({
      registeredCount: 1,
      requestedCount: 1,
      status: 'unresolved-effects',
      unregisteredKinds: [],
      unresolvedIndexes: [0],
    });
  });
});

describe('offscreen effect pipeline snapshots', () => {
  it('captures runners in each explicitly created immutable pipeline', async () => {
    const screen = await createWgpuRenderStateForTest();
    const first: WgpuRenderEffectRunner = vi.fn();
    const later: WgpuRenderEffectRunner = vi.fn();
    registerWgpuRenderEffect(screen, 'acme.First', first);
    const offscreen = createWgpuOffscreenRenderState(
      screen.deviceState,
      createWgpuPipeline(getWgpuRenderStateRuntime(screen).registries),
      { format: screen.format },
    );
    registerWgpuRenderEffect(screen, 'acme.Later', later);

    expect(getWgpuRenderEffectRunner(offscreen, 'acme.First')).toBe(first);
    expect(getWgpuRenderEffectRunner(offscreen, 'acme.Later')).toBeNull();

    const refreshed = createWgpuOffscreenRenderState(
      screen.deviceState,
      createWgpuPipeline(getWgpuRenderStateRuntime(screen).registries),
      { format: screen.format },
    );
    expect(getWgpuRenderEffectRunner(refreshed, 'acme.Later')).toBe(later);
  });
});

describe('setWgpuRenderEffectApplicationGuard', () => {
  it('reports each failed application to the installed guard, and goes silent again when cleared', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    const seen: string[] = [];
    const chain = [createEntity({ kind: 'test.seam-missing' })] as unknown as Readonly<RenderEffect>[];

    setWgpuRenderEffectApplicationGuard(state, (_state, explanation) => seen.push(explanation.status));
    applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, chain);

    expect(seen).toEqual(['unregistered-effects']);

    // Clearing must restore the original silence exactly: the seam is the only path by which a dropped
    // chain is observable, so a stale guard is the difference between a diagnostic and a leak.
    setWgpuRenderEffectApplicationGuard(state, null);
    applyWgpuRenderEffectsToRenderTexture(state, pool, source, dest, scratch, chain);

    expect(seen).toEqual(['unregistered-effects']);
  });
});
