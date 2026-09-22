import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createRenderState, enableRenderRegistrySignals, getRenderStateRuntime } from '@flighthq/render/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { Effect, RenderState } from '@flighthq/types/contract';
import { RenderRegistryTable } from '@flighthq/types/contract';

import { createBlurEffect, registerBlurEffectPaddingResolver } from './blurEffect';
import {
  computeEffectPadding,
  explainEffectPadding,
  getDirectionalEffectPadding,
  getGaussianEffectPadding,
  registerEffectPaddingResolver,
} from './effectPadding';

describe('computeEffectPadding', () => {
  let state: RenderState;

  beforeEach(() => {
    state = createRenderState();
    registerBlurEffectPaddingResolver(state);
    registerEffectPaddingResolver(state, 'acme.Pointwise', () => ({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    }));
  });

  it('adds each side across a sequential effect chain while pointwise effects add zero', () => {
    expect(
      computeEffectPadding(state, [
        createBlurEffect({ blurX: 2, blurY: 1 }),
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Pointwise';
          return finishEntity(out) as Effect;
        })(),
        createBlurEffect({ blurX: 1, blurY: 4 }),
      ]),
    ).toEqual({ bottom: 15, left: 9, right: 9, top: 15 });
  });

  it('returns a zero sentinel for an unregistered kind', () => {
    const effect = (() => {
      const out = allocateEntity<any>();
      out.kind = 'acme.Missing';
      return finishEntity(out) as Effect;
    })();
    expect(computeEffectPadding(state, effect)).toEqual({ bottom: 0, left: 0, right: 0, top: 0 });
  });

  it('writes into a caller-owned output object when supplied', () => {
    const out = { bottom: -1, left: -1, right: -1, top: -1 };

    expect(
      computeEffectPadding(
        state,
        [createBlurEffect({ blurX: 2, blurY: 1 }), createBlurEffect({ blurX: 1, blurY: 4 })],
        out,
      ),
    ).toBe(out);
    expect(out).toEqual({ bottom: 15, left: 9, right: 9, top: 15 });
  });

  it('emits a shared registry miss only when the signal seam is enabled', () => {
    const misses: Array<readonly [RenderRegistryTable, string]> = [];
    connectSignal(enableRenderRegistrySignals(state).onRegistryMiss, (registry, kind) => {
      misses.push([registry, kind]);
    });
    expect(
      computeEffectPadding(
        state,
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out) as Effect;
        })(),
      ),
    ).toEqual({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    });
    expect(misses).toEqual([[RenderRegistryTable.EffectPaddingResolver, 'acme.Missing']]);
  });
});

describe('explainEffectPadding', () => {
  it('reports every missing resolver kind while preserving resolved padding', () => {
    const state = createRenderState();
    registerBlurEffectPaddingResolver(state);

    expect(
      explainEffectPadding(state, [
        createBlurEffect({ blurX: 2, blurY: 3 }),
        (() => {
          const out = allocateEntity<any>();
          out.kind = 'acme.Missing';
          return finishEntity(out) as Effect;
        })(),
      ]),
    ).toEqual({
      missingKinds: ['acme.Missing'],
      padding: { bottom: 9, left: 6, right: 6, top: 9 },
      status: 'missing-resolver',
    });
  });
});

describe('getDirectionalEffectPadding', () => {
  it('adds positive screen-space offsets only to the reached sides', () => {
    expect(getDirectionalEffectPadding(2, 3, 4.25, 5.5)).toEqual({
      bottom: 15,
      left: 6,
      right: 11,
      top: 9,
    });
  });

  it('adds negative screen-space offsets only to left and top', () => {
    expect(getDirectionalEffectPadding(1, 1, -2.5, -4.25)).toEqual({
      bottom: 3,
      left: 6,
      right: 3,
      top: 8,
    });
  });
});

describe('getGaussianEffectPadding', () => {
  it('uses a sanitized three-sigma extent on each axis', () => {
    expect(getGaussianEffectPadding(2.1, -4)).toEqual({ bottom: 0, left: 7, right: 7, top: 0 });
  });
});

describe('registerEffectPaddingResolver', () => {
  it('adds and removes a state-local resolver', () => {
    const state = createRenderState();
    const resolver = vi.fn(() => ({ bottom: 1, left: 2, right: 3, top: 4 }));

    registerEffectPaddingResolver(state, 'acme.Effect', resolver);
    const before = getRenderStateRuntime(state).registries.effectPaddingResolvers;
    expect(before?.get('acme.Effect')).toBe(resolver);

    registerEffectPaddingResolver(state, 'acme.Effect', null);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers).not.toBe(before);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.has('acme.Effect')).toBe(false);
  });

  it('replaces a registration without mutating the earlier snapshot', () => {
    const state = createRenderState();
    const first = vi.fn(() => ({ bottom: 1, left: 2, right: 3, top: 4 }));
    const replacement = vi.fn(() => ({ bottom: 4, left: 3, right: 2, top: 1 }));
    registerEffectPaddingResolver(state, 'acme.Effect', first);
    const before = getRenderStateRuntime(state).registries.effectPaddingResolvers;

    registerEffectPaddingResolver(state, 'acme.Effect', replacement);

    expect(before?.get('acme.Effect')).toBe(first);
    expect(getRenderStateRuntime(state).registries.effectPaddingResolvers?.get('acme.Effect')).toBe(replacement);
  });
});
