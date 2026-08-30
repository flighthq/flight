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
  it('replaces the table while an explicit pipeline state retains its snapshot through lazy scene init', () => {
    const { state: screen } = makeWgpuScene3DState();
    const initial = makeSnippet();
    const override = makeSnippet({ contribution: () => ({ source: '// override' }) });
    registerWgpuModifierSnippet(screen, initial);
    const snapshot = getWgpuRenderStateRuntime(screen).registries.modifierSnippets;
    const { state: derived } = makeWgpuScene3DState(createWgpuPipeline(getWgpuRenderStateRuntime(screen).registries));

    getWgpuScene3DRuntime(derived);
    registerWgpuModifierSnippet(screen, override);

    expect(getWgpuRenderStateRuntime(derived).registries.modifierSnippets).toBe(snapshot);
    expect(getWgpuRenderStateRuntime(derived).registries.modifierSnippetRevision).toBe(1);
    expect(getWgpuRenderStateRuntime(screen).registries.modifierSnippets).not.toBe(snapshot);
    expect(getWgpuRenderStateRuntime(screen).registries.modifierSnippetRevision).toBe(2);
    expect(getRegistryTableEntry(snapshot, 'acme.Test')).toBe(initial);
    expect(resolveWgpuModifierSnippet(derived, 'acme.Test')).toBe(initial);
    expect(resolveWgpuModifierSnippet(screen, 'acme.Test')).toBe(override);
  });
});

describe('resolveWgpuModifierSnippet', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeWgpuScene3DState();
    expect(resolveWgpuModifierSnippet(state, 'acme.Missing')).toBeNull();
  });
});
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createWgpuPipeline, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
