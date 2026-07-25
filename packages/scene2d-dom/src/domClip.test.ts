import { enableDomClipSupport } from './domClip';
import { createDomRenderState } from './domRenderState';

describe('enableDomClipSupport', () => {
  it('sets DOM clip hooks on the render state', () => {
    const state = createDomRenderState(document.createElement('div'));

    enableDomClipSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
