import { ModifierSlot } from '@flighthq/types/contract';
import type { GlModifierSnippet } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlModifierSnippet, resolveGlModifierSnippet } from './glShadedModifierSnippet';

function makeSnippet(overrides?: Partial<GlModifierSnippet>): GlModifierSnippet {
  return {
    kind: 'acme.Test',
    slot: ModifierSlot.Effect,
    contribution: () => '// noop',
    ...overrides,
  };
}

describe('registerGlModifierSnippet', () => {
  it('leaves the modifier registry unallocated until the first registration', () => {
    const { state } = makeGlScene3DState();
    expect(getGlScene3DRuntime(state).modifierSnippetRegistry).toBeNull();
    registerGlModifierSnippet(state, makeSnippet());
    expect(getGlScene3DRuntime(state).modifierSnippetRegistry).not.toBeNull();
  });

  it('stores a snippet resolvable by its kind', () => {
    const { state } = makeGlScene3DState();
    const snippet = makeSnippet();
    registerGlModifierSnippet(state, snippet);
    expect(resolveGlModifierSnippet(state, 'acme.Test')).toBe(snippet);
  });

  it('is last-write-wins for the same kind', () => {
    const { state } = makeGlScene3DState();
    registerGlModifierSnippet(state, makeSnippet());
    const override = makeSnippet({ contribution: () => '// override' });
    registerGlModifierSnippet(state, override);
    expect(resolveGlModifierSnippet(state, 'acme.Test')).toBe(override);
  });
});

describe('resolveGlModifierSnippet', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeGlScene3DState();
    expect(resolveGlModifierSnippet(state, 'acme.Missing')).toBeNull();
  });
});
