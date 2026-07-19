import type { Texture } from '@flighthq/types';
import { DissolveModifierKind, ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createDissolveModifier } from './createDissolveModifier';

describe('createDissolveModifier', () => {
  it('sets the kind and Effect slot', () => {
    const modifier = createDissolveModifier({ threshold: 0.5 });
    expect(modifier.kind).toBe(DissolveModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Effect);
  });

  it('carries the threshold through and defaults the edge and noise scale', () => {
    const modifier = createDissolveModifier({ threshold: 0.3 });
    expect(modifier.threshold).toBe(0.3);
    expect(modifier.edgeColor).toBe(0xff6600ff);
    expect(modifier.edgeWidth).toBe(0.05);
    expect(modifier.scale).toBe(8);
    expect(modifier.map).toBeUndefined();
  });

  it('keeps a noise map by reference when provided', () => {
    const map = {} as Texture;
    const modifier = createDissolveModifier({ threshold: 0.5, map, edgeColor: 0x00ffddff, edgeWidth: 0.1 });
    expect(modifier.map).toBe(map);
    expect(modifier.edgeColor).toBe(0x00ffddff);
    expect(modifier.edgeWidth).toBe(0.1);
  });
});
