import { ModifierSlot, ToonModifierKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createToonModifier } from './createToonModifier';

describe('createToonModifier', () => {
  it('sets the kind and Effect slot', () => {
    const modifier = createToonModifier({ steps: 3 });
    expect(modifier.kind).toBe(ToonModifierKind);
    expect(modifier.slot).toBe(ModifierSlot.Effect);
  });

  it('carries the step count through and defaults smoothness to 0', () => {
    const modifier = createToonModifier({ steps: 4 });
    expect(modifier.steps).toBe(4);
    expect(modifier.smoothness).toBe(0);
  });

  it('applies a provided smoothness', () => {
    const modifier = createToonModifier({ steps: 2, smoothness: 0.2 });
    expect(modifier.smoothness).toBe(0.2);
  });
});
