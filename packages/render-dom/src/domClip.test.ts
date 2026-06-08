import { enableDOMClipRectangleSupport, enableDOMMaskSupport } from './domClip';
import { createDOMRenderState } from './domRenderState';

describe('enableDOMClipRectangleSupport', () => {
  it('sets DOM clip hooks and enables the ClipRectangle feature', () => {
    const state = createDOMRenderState(document.createElement('div'));

    enableDOMClipRectangleSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableDOMMaskSupport', () => {
  it('sets DOM mask hooks on the render state', () => {
    const state = createDOMRenderState(document.createElement('div'));

    enableDOMMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
