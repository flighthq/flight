import { enableCanvasClipSupport } from './canvasClip';
import { createCanvasRenderState } from './canvasRenderState';

describe('enableCanvasClipSupport', () => {
  it('sets the display object clip hooks on the render state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    enableCanvasClipSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
