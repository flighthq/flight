import type { Texture, Vector2Like } from '@flighthq/types';
import { AnimatedNormalModifierKind, ModifierSlot } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createAnimatedNormalModifier } from './createAnimatedNormalModifier';

describe('createAnimatedNormalModifier', () => {
  const scroll: Vector2Like = { x: 0.1, y: 0 };

  it('sets the kind and Normal slot', () => {
    const modifier = createAnimatedNormalModifier({ map: null, scroll });
    expect(modifier.kind).toBe(AnimatedNormalModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Normal);
  });

  it('accepts a null map (the disabled variant)', () => {
    const modifier = createAnimatedNormalModifier({ map: null, scroll });
    expect(modifier.map).toBeNull();
  });

  it('keeps the map and scroll by reference and defaults strength to 1', () => {
    const map = {} as Texture;
    const modifier = createAnimatedNormalModifier({ map, scroll });
    expect(modifier.map).toBe(map);
    expect(modifier.scroll).toBe(scroll);
    expect(modifier.strength).toBe(1);
  });

  it('leaves the second layer absent when not provided', () => {
    const modifier = createAnimatedNormalModifier({ map: {} as Texture, scroll });
    expect(modifier.secondaryMap).toBeUndefined();
    expect(modifier.secondaryScroll).toBeUndefined();
  });

  it('carries the second dual-scroll layer when provided', () => {
    const secondaryMap = {} as Texture;
    const secondaryScroll: Vector2Like = { x: -0.05, y: 0.02 };
    const modifier = createAnimatedNormalModifier({
      map: {} as Texture,
      scroll,
      strength: 0.5,
      secondaryMap,
      secondaryScroll,
    });
    expect(modifier.strength).toBe(0.5);
    expect(modifier.secondaryMap).toBe(secondaryMap);
    expect(modifier.secondaryScroll).toBe(secondaryScroll);
  });
});
