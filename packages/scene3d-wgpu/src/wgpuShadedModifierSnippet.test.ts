import type { WgpuModifierSnippet } from '@flighthq/types/contract';
import { ModifierSlot } from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { registerWgpuModifierSnippet, resolveWgpuModifierSnippet } from './wgpuShadedModifierSnippet';

function makeSnippet(overrides?: Partial<WgpuModifierSnippet>): WgpuModifierSnippet {
  return {
    contribution: () => ({ source: '// noop' }),
    kind: 'acme.Test',
    slot: ModifierSlot.Effect,
    ...overrides,
  };
}

describe('registerWgpuModifierSnippet', () => {
  it('lazily allocates a state-scoped registry and is last-write-wins', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuScene3DRuntime(state).modifierSnippetRegistry).toBeNull();
    registerWgpuModifierSnippet(state, makeSnippet());
    const override = makeSnippet({ contribution: () => ({ source: '// override' }) });
    registerWgpuModifierSnippet(state, override);
    expect(resolveWgpuModifierSnippet(state, 'acme.Test')).toBe(override);
  });
});

describe('resolveWgpuModifierSnippet', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeWgpuScene3DState();
    expect(resolveWgpuModifierSnippet(state, 'acme.Missing')).toBeNull();
  });
});
