import { areGlRenderTextureGuardsEnabled, enableGlRenderTextureGuards } from './enableGlRenderTextureGuards.ts';
import { createGlState } from './glTestHelper.ts';

describe('areGlRenderTextureGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the context', () => {
    const { state } = createGlState();
    expect(areGlRenderTextureGuardsEnabled(state)).toBe(false);

    enableGlRenderTextureGuards(state, null);

    expect(areGlRenderTextureGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlRenderTextureGuards', () => {
  it('is idempotent', () => {
    const { state } = createGlState();
    enableGlRenderTextureGuards(state, null);
    enableGlRenderTextureGuards(state, null);
    expect(areGlRenderTextureGuardsEnabled(state)).toBe(true);
  });
});
