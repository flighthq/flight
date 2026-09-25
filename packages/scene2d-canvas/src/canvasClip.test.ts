import { enableCanvasClip } from './canvasClip.ts';
import { createCanvasRenderState } from './canvasTestSupport.ts';

describe('enableCanvasClip', () => {
  it('sets the display object clip hooks on the render state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    enableCanvasClip(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
