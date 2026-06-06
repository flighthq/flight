import { enableDOMMaskSupport, enableDOMScrollRectangleSupport } from './domClip';
import { createDOMRenderState } from './domRenderState';

describe('enableDOMMaskSupport', () => {
  it('sets DOM mask hooks on the render state', () => {
    const state = createDOMRenderState(document.createElement('div'));

    enableDOMMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableDOMScrollRectangleSupport', () => {
  it('sets DOM clip hooks and enables the ScrollRectangle feature', () => {
    const state = createDOMRenderState(document.createElement('div'));

    enableDOMScrollRectangleSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
