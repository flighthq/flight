import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createGlPipeline, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
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
  it('starts with empty persistent policy and advances its revision on registration', () => {
    const { state } = makeGlScene3DState();
    expect(getGlRenderStateRuntime(state).registries.modifierSnippets.entries.size).toBe(0);
    expect(getGlRenderStateRuntime(state).registries.modifierSnippetRevision).toBe(0);
    registerGlModifierSnippet(state, makeSnippet());
    expect(getGlRenderStateRuntime(state).registries.modifierSnippets.entries.size).toBe(1);
    expect(getGlRenderStateRuntime(state).registries.modifierSnippetRevision).toBe(1);
  });

  it('stores a snippet resolvable by its kind', () => {
    const { state } = makeGlScene3DState();
    const snippet = makeSnippet();
    registerGlModifierSnippet(state, snippet);
    expect(resolveGlModifierSnippet(state, 'acme.Test')).toBe(snippet);
  });

  it('replaces the table while an explicitly copied state retains its snapshot through lazy scene init', () => {
    const { state: screen } = makeGlScene3DState();
    const initial = makeSnippet();
    const override = makeSnippet({ contribution: () => '// override' });
    registerGlModifierSnippet(screen, initial);
    const snapshot = getGlRenderStateRuntime(screen).registries.modifierSnippets;
    const { state: derived } = makeGlScene3DState(
      undefined,
      createGlPipeline(getGlRenderStateRuntime(screen).registries),
    );

    getGlScene3DRuntime(derived);
    registerGlModifierSnippet(screen, override);

    expect(getGlRenderStateRuntime(derived).registries.modifierSnippets).toBe(snapshot);
    expect(getGlRenderStateRuntime(derived).registries.modifierSnippetRevision).toBe(1);
    expect(getGlRenderStateRuntime(screen).registries.modifierSnippets).not.toBe(snapshot);
    expect(getGlRenderStateRuntime(screen).registries.modifierSnippetRevision).toBe(2);
    expect(getRegistryTableEntry(snapshot, 'acme.Test')).toBe(initial);
    expect(resolveGlModifierSnippet(derived, 'acme.Test')).toBe(initial);
    expect(resolveGlModifierSnippet(screen, 'acme.Test')).toBe(override);
  });
});

describe('resolveGlModifierSnippet', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeGlScene3DState();
    expect(resolveGlModifierSnippet(state, 'acme.Missing')).toBeNull();
  });
});
