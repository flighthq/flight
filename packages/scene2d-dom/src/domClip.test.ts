import { enableDomClipSupport } from './domClip.ts';
import { createDomRenderState } from './domRenderState.ts';

describe('enableDomClipSupport', () => {
  it('sets DOM clip hooks on the render state', () => {
    const state = createDomRenderState(document.createElement('div'));

    enableDomClipSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
