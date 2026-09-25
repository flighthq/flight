import { areGlRenderTextureGuardsEnabled, enableGlRenderTextureGuards } from './enableGlRenderTextureGuards.ts';
import { createGlState } from './glTestHelper.ts';

describe('areGlRenderTextureGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the context', () => {
    const { state } = createGlState();
    expect(areGlRenderTextureGuardsEnabled(state)).toBe(false);

    enableGlRenderTextureGuards(state);

    expect(areGlRenderTextureGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlRenderTextureGuards', () => {
  it('is idempotent', () => {
    const { state } = createGlState();
    enableGlRenderTextureGuards(state);
    enableGlRenderTextureGuards(state);
    expect(areGlRenderTextureGuardsEnabled(state)).toBe(true);
  });
});
