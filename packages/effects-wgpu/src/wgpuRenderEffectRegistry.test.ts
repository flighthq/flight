import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createWgpuRenderStateForTest,
  getWgpuRenderStateRuntime,
  installWgpuMock,
} from '@flighthq/render-wgpu/contract';

import {
  getWgpuRenderEffectRunner,
  hasWgpuRenderEffectRunner,
  isWgpuRenderEffectResolvable,
  registerWgpuRenderEffect,
} from './wgpuRenderEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuRenderEffectRunner', () => {
  it('returns null when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(null);
  });
});

describe('hasWgpuRenderEffectRunner', () => {
  it('returns false when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(hasWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(false);
  });

  it('returns true after a runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuRenderEffect(state, 'VignetteEffect', vi.fn());
    expect(hasWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(true);
  });
});

describe('isWgpuRenderEffectResolvable', () => {
  it('treats a runner without a resolver as always resolvable', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuRenderEffect(state, 'acme.Always', vi.fn());
    expect(isWgpuRenderEffectResolvable(state, (() => { const out = allocateEntity<unknown>(); out.kind = 'acme.Always'; return finishEntity(out); })())).toBe(true);
  });

  it('asks the resolver for each effect instance', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuRenderEffect(state, 'acme.Named', vi.fn(), (_state, effect) => 'key' in effect);
    expect(isWgpuRenderEffectResolvable(state, (() => { const out = allocateEntity<unknown>(); out.kind = 'acme.Named'; return finishEntity(out); })())).toBe(false);
    expect(isWgpuRenderEffectResolvable(state, (() => { const out = allocateEntity<unknown>(); out.key = 'ready'; out.kind = 'acme.Named'; return finishEntity(out) as never)).toBe(true);; })()
  });
});

describe('registerWgpuRenderEffect', () => {
  it('registers a runner retrievable by its kind', async () => {
    const state = await createWgpuRenderStateForTest();
    const runner = vi.fn();
    const before = getWgpuRenderStateRuntime(state).registries.renderEffects;
    registerWgpuRenderEffect(state, 'VignetteEffect', runner);
    expect(getWgpuRenderEffectRunner(state, 'VignetteEffect')).toBe(runner);
    expect(getWgpuRenderStateRuntime(state).registries.renderEffects).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', async () => {
    const state = await createWgpuRenderStateForTest();
    const runnerA = vi.fn();
    const runnerB = vi.fn();
    registerWgpuRenderEffect(state, 'TestEffect', runnerA);
    const before = getWgpuRenderStateRuntime(state).registries.renderEffects;

    registerWgpuRenderEffect(state, 'TestEffect', runnerB);

    expect(getWgpuRenderEffectRunner(state, 'TestEffect')).toBe(runnerB);
    expect(before.entries.get('TestEffect')).toEqual({
      state: 'bound',
      value: { isResolvable: undefined, runner: runnerA },
    });
  });
});
