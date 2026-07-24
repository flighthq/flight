import type { WgpuModifierSnippet } from '@flighthq/types';
import { ModifierSlot } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
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
    const { state } = makeWgpuSceneState();
    expect(getWgpuSceneRuntime(state).modifierSnippetRegistry).toBeNull();
    registerWgpuModifierSnippet(state, makeSnippet());
    const override = makeSnippet({ contribution: () => ({ source: '// override' }) });
    registerWgpuModifierSnippet(state, override);
    expect(resolveWgpuModifierSnippet(state, 'acme.Test')).toBe(override);
  });
});

describe('resolveWgpuModifierSnippet', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeWgpuSceneState();
    expect(resolveWgpuModifierSnippet(state, 'acme.Missing')).toBeNull();
  });
});
