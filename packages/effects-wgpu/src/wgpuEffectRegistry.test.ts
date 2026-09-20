import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  createWgpuRenderStateForTest,
  getWgpuRenderStateRuntime,
  installWgpuMock,
} from '@flighthq/render-wgpu/contract';

import {
  getWgpuEffectRunner,
  hasWgpuEffectRunner,
  isWgpuEffectResolvable,
  registerWgpuEffect,
} from './wgpuEffectRegistry';

beforeAll(() => {
  installWgpuMock();
});

describe('getWgpuEffectRunner', () => {
  it('returns null when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuEffectRunner(state, 'VignetteEffect')).toBe(null);
  });
});

describe('hasWgpuEffectRunner', () => {
  it('returns false when no runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(hasWgpuEffectRunner(state, 'VignetteEffect')).toBe(false);
  });

  it('returns true after a runner is registered for the kind', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuEffect(state, 'VignetteEffect', vi.fn());
    expect(hasWgpuEffectRunner(state, 'VignetteEffect')).toBe(true);
  });
});

describe('isWgpuEffectResolvable', () => {
  it('treats a runner without a resolver as always resolvable', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuEffect(state, 'acme.Always', vi.fn());
    expect(
      isWgpuEffectResolvable(
        state,
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Always';
          return finishEntity(out);
        })(),
      ),
    ).toBe(true);
  });

  it('asks the resolver for each effect instance', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuEffect(state, 'acme.Named', vi.fn(), (_state, effect) => 'key' in effect);
    expect(
      isWgpuEffectResolvable(
        state,
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Named';
          return finishEntity(out);
        })(),
      ),
    ).toBe(false);
    expect(
      isWgpuEffectResolvable(
        state,
        (() => {
          const out = allocateEntity<any>();
          out.key = 'ready';
          out.kind = 'acme.Named';
          return finishEntity(out) as never;
        })(),
      ),
    ).toBe(true);
  });
});

describe('registerWgpuEffect', () => {
  it('registers a runner retrievable by its kind', async () => {
    const state = await createWgpuRenderStateForTest();
    const runner = vi.fn();
    const before = getWgpuRenderStateRuntime(state).registries.effects;
    registerWgpuEffect(state, 'VignetteEffect', runner);
    expect(getWgpuEffectRunner(state, 'VignetteEffect')).toBe(runner);
    expect(getWgpuRenderStateRuntime(state).registries.effects).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', async () => {
    const state = await createWgpuRenderStateForTest();
    const runnerA = vi.fn();
    const runnerB = vi.fn();
    registerWgpuEffect(state, 'TestEffect', runnerA);
    const before = getWgpuRenderStateRuntime(state).registries.effects;

    registerWgpuEffect(state, 'TestEffect', runnerB);

    expect(getWgpuEffectRunner(state, 'TestEffect')).toBe(runnerB);
    expect(before.entries.get('TestEffect')).toEqual({
      state: 'bound',
      value: { isResolvable: undefined, runner: runnerA },
    });
  });
});
