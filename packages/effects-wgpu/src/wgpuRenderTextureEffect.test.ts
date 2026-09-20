import { createBlurEffect } from '@flighthq/effects/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  acquireWgpuRenderTexture,
  beginWgpuFrame,
  createWgpuOffscreenRenderState,
  allocateEmptyWgpuRenderRegistries,
  createWgpuRenderStateForTest,
  createWgpuRenderTexturePool,
  getWgpuRenderStateRuntime,
  getWgpuRenderTextureTarget,
  installWgpuMock,
  isWgpuRenderTextureReady,
  writeWgpuRenderTextureTarget,
} from '@flighthq/render-wgpu/contract';
import type { RenderEffect, WgpuEffectRunner } from '@flighthq/types/contract';

import { defaultWgpuBlurEffectRunner } from './wgpuBlurEffect';
import { getWgpuEffectRunner, registerWgpuEffect } from './wgpuEffectRegistry';
import {
  applyWgpuEffectsToRenderTexture,
  explainWgpuEffectApplication,
  setWgpuEffectApplicationGuard,
} from './wgpuRenderTextureEffect';

beforeAll(() => installWgpuMock());

describe('applyWgpuEffectsToRenderTexture', () => {
  it('ping-pongs an even registered chain so the last operation publishes destination', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    const first: WgpuEffectRunner = vi.fn();
    const second: WgpuEffectRunner = vi.fn();
    registerWgpuEffect(state, 'acme.First', first);
    registerWgpuEffect(state, 'acme.Second', second);

    expect(
      applyWgpuEffectsToRenderTexture(state, pool, source, dest, scratch, [
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
    registerWgpuEffect(state, 'BlurEffect', defaultWgpuBlurEffectRunner);
    beginWgpuFrame(state);

    expect(
      applyWgpuEffectsToRenderTexture(state, pool, source, dest, scratch, [createBlurEffect({ blurX: 2, blurY: 3 })]),
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
      applyWgpuEffectsToRenderTexture(state, pool, source, dest, scratch, [
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out);
        })(),
      ]),
    ).toBe(false);
    expect(isWgpuRenderTextureReady(state, dest)).toBe(false);
  });
});

describe('explainWgpuEffectApplication', () => {
  it('names the unregistered kinds and the status, as plain data with no message text', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    registerWgpuEffect(state, 'test.explain-registered', (() => {}) as WgpuEffectRunner);

    const explanation = explainWgpuEffectApplication(state, source, dest, [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.explain-registered';
        return finishEntity(out);
      })(),
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.explain-missing';
        return finishEntity(out);
      })(),
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
    registerWgpuEffect(state, 'test.explain-unresolved', vi.fn(), () => false);

    expect(
      explainWgpuEffectApplication(state, source, dest, [
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'test.explain-unresolved';
          return finishEntity(out);
        })(),
      ]),
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
    const first: WgpuEffectRunner = vi.fn();
    const later: WgpuEffectRunner = vi.fn();
    registerWgpuEffect(screen, 'acme.First', first);
    const offscreen = createWgpuOffscreenRenderState(
      screen.deviceState,
      { ...getWgpuRenderStateRuntime(screen).registries },
      { format: screen.format },
    );
    registerWgpuEffect(screen, 'acme.Later', later);

    expect(getWgpuEffectRunner(offscreen, 'acme.First')).toBe(first);
    expect(getWgpuEffectRunner(offscreen, 'acme.Later')).toBeNull();

    const refreshed = createWgpuOffscreenRenderState(
      screen.deviceState,
      { ...getWgpuRenderStateRuntime(screen).registries },
      { format: screen.format },
    );
    expect(getWgpuEffectRunner(refreshed, 'acme.Later')).toBe(later);
  });
});

describe('setWgpuEffectApplicationGuard', () => {
  it('reports each failed application to the installed guard, and goes silent again when cleared', async () => {
    const state = await createWgpuRenderStateForTest();
    const pool = createWgpuRenderTexturePool();
    const source = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const dest = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    const scratch = acquireWgpuRenderTexture(state, pool, { width: 8, height: 8 });
    writeWgpuRenderTextureTarget(state, source, () => {});
    const seen: string[] = [];
    const chain = [
      (() => {
        const out = allocateEntity<any>();
        out.kind = 'test.seam-missing';
        return finishEntity(out);
      })(),
    ] as unknown as Readonly<RenderEffect>[];

    setWgpuEffectApplicationGuard(state, (_state, explanation) => seen.push(explanation.status));
    applyWgpuEffectsToRenderTexture(state, pool, source, dest, scratch, chain);

    expect(seen).toEqual(['unregistered-effects']);

    // Clearing must restore the original silence exactly: the seam is the only path by which a dropped
    // chain is observable, so a stale guard is the difference between a diagnostic and a leak.
    setWgpuEffectApplicationGuard(state, null);
    applyWgpuEffectsToRenderTexture(state, pool, source, dest, scratch, chain);

    expect(seen).toEqual(['unregistered-effects']);
  });
});
