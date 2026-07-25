import { setRenderStateBackgroundColor } from '@flighthq/render';

import { renderDomBackground } from './domBackground';
import { createDomRenderState } from './domRenderState';

function makeState() {
  const div = document.createElement('div');
  return { div, state: createDomRenderState(div) };
}

describe('renderDomBackground', () => {
  it('sets element backgroundColor when background alpha is non-zero', () => {
    const { div, state } = makeState();
    setRenderStateBackgroundColor(state, 0xff0000ff); // opaque red

    renderDomBackground(state);

    expect(div.style.backgroundColor).not.toBe('');
  });

  it('clears element backgroundColor when background alpha is 0', () => {
    const { div, state } = makeState();
    div.style.backgroundColor = 'red';
    setRenderStateBackgroundColor(state, 0xff000000); // alpha = 0

    renderDomBackground(state);

    expect(div.style.backgroundColor).toBe('');
  });

  it('does not throw when called with default (transparent) background', () => {
    const { state } = makeState();
    expect(() => renderDomBackground(state)).not.toThrow();
  });
});
