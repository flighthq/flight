import { areGlRenderStateGuardsEnabled, enableGlRenderStateGuards } from './enableGlRenderStateGuards';
import { createGlRenderState } from './glRenderState';
import { makeGL } from './glTestHelper';

function createState() {
  const canvas = document.createElement('canvas');
  canvas.getContext = vi.fn().mockReturnValue(makeGL()) as typeof canvas.getContext;
  return createGlRenderState(canvas);
}

describe('areGlRenderStateGuardsEnabled', () => {
  it('reports whether the state-local multiple-root guard is installed', () => {
    const state = createState();
    expect(areGlRenderStateGuardsEnabled(state)).toBe(false);
    enableGlRenderStateGuards(state);
    expect(areGlRenderStateGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlRenderStateGuards', () => {
  it('installs the state-local multiple-root guard idempotently', () => {
    const state = createState();
    enableGlRenderStateGuards(state);
    enableGlRenderStateGuards(state);
    expect(areGlRenderStateGuardsEnabled(state)).toBe(true);
  });
});
