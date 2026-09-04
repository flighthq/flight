import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRenderState, enableRenderRegistrySignals, getRenderStateRuntime } from '@flighthq/render/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { RenderEffect, RenderState } from '@flighthq/types/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { createBlurEffect, registerBlurEffectPaddingResolver } from './blurEffect';
import {
  computeRenderEffectPadding,
  explainRenderEffectPadding,
  getDirectionalRenderEffectPadding,
  getGaussianRenderEffectPadding,
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
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Pointwise';
          return finishEntity(out) as RenderEffect;
        })(),
        createBlurEffect({ blurX: 1, blurY: 4 }),
      ]),
    ).toEqual({ bottom: 15, left: 9, right: 9, top: 15 });
  });

  it('returns a zero sentinel for an unregistered kind', () => {
    const effect = allocateEntity<any>();
    effect.kind = 'acme.Missing';
    expect(computeRenderEffectPadding(state, effect)).toEqual({ bottom: 0, left: 0, right: 0, top: 0 });
  });

  it('writes into a caller-owned output object when supplied', () => {
    const out = { bottom: -1, left: -1, right: -1, top: -1 };

    expect(
      computeRenderEffectPadding(
        state,
        [createBlurEffect({ blurX: 2, blurY: 1 }), createBlurEffect({ blurX: 1, blurY: 4 })],
        out,
      ),
    ).toBe(out);
    expect(out).toEqual({ bottom: 15, left: 9, right: 9, top: 15 });
  });

  it('emits a shared registry miss only when the signal seam is enabled', () => {
    const misses: Array<readonly [RenderRegistry, string]> = [];
    connectSignal(enableRenderRegistrySignals(state).onRegistryMiss, (registry, kind) => {
      misses.push([registry, kind]);
    });
    expect(
      computeRenderEffectPadding(
        state,
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out) as RenderEffect;
        })(),
      ),
    ).toEqual({
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
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out) as RenderEffect;
        })(),
      ]),
    ).toEqual({
      missingKinds: ['acme.Missing'],
      padding: { bottom: 9, left: 6, right: 6, top: 9 },
      status: 'missing-resolver',
    });
  });
});

describe('getDirectionalRenderEffectPadding', () => {
  it('adds positive screen-space offsets only to the reached sides', () => {
    expect(getDirectionalRenderEffectPadding(2, 3, 4.25, 5.5)).toEqual({
      bottom: 15,
      left: 6,
      right: 11,
      top: 9,
    });
  });

  it('adds negative screen-space offsets only to left and top', () => {
    expect(getDirectionalRenderEffectPadding(1, 1, -2.5, -4.25)).toEqual({
      bottom: 3,
      left: 6,
      right: 3,
      top: 8,
    });
  });
});

describe('getGaussianRenderEffectPadding', () => {
  it('uses a sanitized three-sigma extent on each axis', () => {
    expect(getGaussianRenderEffectPadding(2.1, -4)).toEqual({ bottom: 0, left: 7, right: 7, top: 0 });
  });
});

describe('registerRenderEffectPaddingResolver', () => {
  it('adds and removes a state-local resolver', () => {
    const state = createRenderState();
    const resolver = vi.fn(() => ({ bottom: 1, left: 2, right: 3, top: 4 }));

    registerRenderEffectPaddingResolver(state, 'acme.Effect', resolver);
    const before = getRenderStateRuntime(state).registries.effectPaddingResolvers;
    expect(before?.entries.get('acme.Effect')).toEqual({ state: 'bound', value: resolver });

    registerRenderEffectPaddingResolver(state, 'acme.Effect', null);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers).not.toBe(before);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('acme.Effect')).toBe(false);
  });

  it('replaces a registration without mutating the earlier snapshot', () => {
    const state = createRenderState();
    const first = vi.fn(() => ({ bottom: 1, left: 2, right: 3, top: 4 }));
    const replacement = vi.fn(() => ({ bottom: 4, left: 3, right: 2, top: 1 }));
    registerRenderEffectPaddingResolver(state, 'acme.Effect', first);
    const before = getRenderStateRuntime(state).registries.effectPaddingResolvers;

    registerRenderEffectPaddingResolver(state, 'acme.Effect', replacement);

    expect(before?.entries.get('acme.Effect')).toEqual({ state: 'bound', value: first });
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.get('acme.Effect')).toEqual({
      state: 'bound',
      value: replacement,
    });
  });
});
