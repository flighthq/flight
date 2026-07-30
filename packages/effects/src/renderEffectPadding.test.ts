import { createRenderState, enableRenderRegistrySignals, getRenderStateRuntime } from '@flighthq/render/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { RenderEffect, RenderState } from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { createBlurEffect, registerBlurEffectPaddingResolver } from './blurEffect';
import {
  computeRenderEffectPadding,
  explainRenderEffectPadding,
  registerRenderEffectPaddingResolver,
} from './renderEffectPadding';

describe('computeRenderEffectPadding', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
    registerBlurEffectPaddingResolver(state);
    registerRenderEffectPaddingResolver(state, 'acme.Pointwise', () => ({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    }));
  });

  it('adds each side across a sequential effect chain while pointwise effects add zero', () => {
    expect(
      computeRenderEffectPadding(state, [
        createBlurEffect({ blurX: 2, blurY: 1 }),
        { kind: 'acme.Pointwise' } as RenderEffect,
        createBlurEffect({ blurX: 1, blurY: 4 }),
      ]),
    ).toEqual({ bottom: 15, left: 9, right: 9, top: 15 });
  });

  it('returns a zero sentinel for an unregistered kind', () => {
    const effect = { kind: 'acme.Missing' } as RenderEffect;
    expect(computeRenderEffectPadding(state, effect)).toEqual({ bottom: 0, left: 0, right: 0, top: 0 });
  });

  it('emits a shared registry miss only when the signal seam is enabled', () => {
    const misses: Array<readonly [RenderRegistry, string]> = [];
    connectSignal(enableRenderRegistrySignals(state).onRegistryMiss, (registry, kind) => {
      misses.push([registry, kind]);
    });
    expect(computeRenderEffectPadding(state, { kind: 'acme.Missing' } as RenderEffect)).toEqual({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    });
    expect(misses).toEqual([[RenderRegistry.EffectPaddingResolver, 'acme.Missing']]);
  });
});

describe('explainRenderEffectPadding', () => {
  it('reports every missing resolver kind while preserving resolved padding', () => {
    const state = createRenderState();
    registerBlurEffectPaddingResolver(state);

    expect(
      explainRenderEffectPadding(state, [
        createBlurEffect({ blurX: 2, blurY: 3 }),
        { kind: 'acme.Missing' } as RenderEffect,
      ]),
    ).toEqual({
      missingKinds: ['acme.Missing'],
      padding: { bottom: 9, left: 6, right: 6, top: 9 },
      status: 'missing-resolver',
    });
  });
});

describe('registerRenderEffectPaddingResolver', () => {
  it('adds and removes a state-local resolver', () => {
    const state = createRenderState();
    const resolver = vi.fn(() => ({ bottom: 1, left: 2, right: 3, top: 4 }));

    registerRenderEffectPaddingResolver(state, 'acme.Effect', resolver);
    expect(getRenderStateRuntime(state).renderEffectPaddingResolverRegistry?.get('acme.Effect')).toBe(resolver);

    registerRenderEffectPaddingResolver(state, 'acme.Effect', null);
    expect(getRenderStateRuntime(state).renderEffectPaddingResolverRegistry?.has('acme.Effect')).toBe(false);
  });
});
