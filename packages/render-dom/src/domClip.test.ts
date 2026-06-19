import { enableDOMClipSupport } from './domClip';
import { createDOMRenderState } from './domRenderState';

describe('enableDOMClipSupport', () => {
  it('sets DOM clip hooks on the render state', () => {
    const state = createDOMRenderState(document.createElement('div'));

    enableDOMClipSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
