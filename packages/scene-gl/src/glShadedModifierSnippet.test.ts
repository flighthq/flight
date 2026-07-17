import { ModifierSlot } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import type { GlModifierSnippet } from './glShadedModifierSnippet';
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
    const { state } = makeGlSceneState();
    expect(getGlSceneRuntime(state).modifierSnippetRegistry).toBeNull();
    registerGlModifierSnippet(state, makeSnippet());
    expect(getGlSceneRuntime(state).modifierSnippetRegistry).not.toBeNull();
  });

  it('stores a snippet resolvable by its kind', () => {
    const { state } = makeGlSceneState();
    const snippet = makeSnippet();
    registerGlModifierSnippet(state, snippet);
    expect(resolveGlModifierSnippet(state, 'acme.Test')).toBe(snippet);
  });

  it('is last-write-wins for the same kind', () => {
    const { state } = makeGlSceneState();
    registerGlModifierSnippet(state, makeSnippet());
    const override = makeSnippet({ contribution: () => '// override' });
    registerGlModifierSnippet(state, override);
    expect(resolveGlModifierSnippet(state, 'acme.Test')).toBe(override);
  });
});

describe('resolveGlModifierSnippet', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeGlSceneState();
    expect(resolveGlModifierSnippet(state, 'acme.Missing')).toBeNull();
  });
});
