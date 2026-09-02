import { createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';
import type { Texture2D } from '@flighthq/types/contract';
import { ImageChannel } from '@flighthq/types/contract';

import {
  createBitmapDisplacementEffect,
  getBitmapDisplacementEffectPadding,
  registerBitmapDisplacementEffectPaddingResolver,
} from './bitmapDisplacementEffect';
import { createDisplacementEffect } from './displacementEffect';
import { getRenderEffectDefaults } from './renderEffectDefaults';
import { getRenderEffectKinds } from './renderEffectInputs';

const map = {} as Texture2D;

describe('BitmapDisplacementEffect defaults', () => {
  it('uses red/green channels, zero scale, and wrapping edges', () => {
    expect(getRenderEffectDefaults('BitmapDisplacementEffect')).toEqual({
      componentX: ImageChannel.Red,
      componentY: ImageChannel.Green,
      edgeMode: 'wrap',
      scaleX: 0,
      scaleY: 0,
    });
  });

  it('participates in the known effect-kind catalog', () => {
    expect(getRenderEffectKinds()).toContain('BitmapDisplacementEffect');
  });
});

describe('createBitmapDisplacementEffect', () => {
  it('keeps bitmap-map displacement distinct from procedural displacement', () => {
    expect(createBitmapDisplacementEffect(map)).toEqual({ kind: 'BitmapDisplacementEffect', map });
    expect(createBitmapDisplacementEffect(map).kind).not.toBe(createDisplacementEffect().kind);
  });

  it('carries explicit channel, scale, and edge options', () => {
    expect(
      createBitmapDisplacementEffect(map, {
        componentX: ImageChannel.Alpha,
        componentY: ImageChannel.Blue,
        edgeMode: 'clamp',
        scaleX: -12,
        scaleY: 7,
      }),
    ).toEqual({
      componentX: ImageChannel.Alpha,
      componentY: ImageChannel.Blue,
      edgeMode: 'clamp',
      kind: 'BitmapDisplacementEffect',
      map,
      scaleX: -12,
      scaleY: 7,
    });
  });

  it('accepts a null map as the loading sentinel', () => {
    expect(createBitmapDisplacementEffect(null).map).toBeNull();
  });
});

describe('getBitmapDisplacementEffectPadding', () => {
  it('uses half the absolute signed scale on each axis', () => {
    expect(
      getBitmapDisplacementEffectPadding(
        createBitmapDisplacementEffect(map, {
          scaleX: -9,
          scaleY: 6.25,
        }),
      ),
    ).toEqual({ bottom: 4, left: 5, right: 5, top: 4 });
  });
});

describe('registerBitmapDisplacementEffectPaddingResolver', () => {
  it('registers the footprint on only the supplied state', () => {
    const state = createRenderState();
    const other = createRenderState();
    registerBitmapDisplacementEffectPaddingResolver(state);
    expect(
      getRenderStateRuntime(state).registries.effectPaddingResolvers?.entries.has('BitmapDisplacementEffect'),
    ).toBe(true);
    expect(getRenderStateRuntime(other).registries.effectPaddingResolvers).toBeUndefined();
  });
});
