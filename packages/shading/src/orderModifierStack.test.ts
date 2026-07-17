import type { Modifier } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createAnimatedNormalModifier } from './createAnimatedNormalModifier';
import { createEmissiveModifier } from './createEmissiveModifier';
import { createRimModifier } from './createRimModifier';
import { orderModifierStack } from './orderModifierStack';

describe('orderModifierStack', () => {
  const normal = createAnimatedNormalModifier({ map: null, scroll: { x: 0, y: 0 } });
  const emissive = createEmissiveModifier({ color: 0xffffffff });
  const rim = createRimModifier({ color: 0xffffffff });

  it('groups modifiers into the canonical Normal -> Emissive -> Effect pipeline order', () => {
    const ordered = orderModifierStack([rim, emissive, normal]);
    expect(ordered.map((modifier) => modifier.slot)).toEqual(['Normal', 'Emissive', 'Effect']);
  });

  it('is independent of cross-slot authoring order', () => {
    const a = orderModifierStack([normal, emissive, rim]);
    const b = orderModifierStack([rim, normal, emissive]);
    expect(a).toEqual(b);
  });

  it('preserves authoring order within one slot', () => {
    const rimA = createRimModifier({ color: 0x111111ff });
    const rimB = createRimModifier({ color: 0x222222ff });
    const ordered = orderModifierStack([rimB, rimA]);
    expect(ordered).toEqual([rimB, rimA]);
  });

  it('sorts unknown and reserved slots after every built-in slot, stably', () => {
    const ambient: Modifier = { kind: 'acme.Ambient', slot: 'Ambient' };
    const vendor: Modifier = { kind: 'acme.Custom', slot: 'acme.Weird' };
    const ordered = orderModifierStack([ambient, rim, vendor, normal]);
    expect(ordered).toEqual([normal, rim, ambient, vendor]);
  });

  it('does not mutate the input stack', () => {
    const input = [rim, normal];
    orderModifierStack(input);
    expect(input).toEqual([rim, normal]);
  });

  it('returns an empty array for an empty stack', () => {
    expect(orderModifierStack([])).toEqual([]);
  });
});
