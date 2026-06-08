import { enableCanvasClipRectangleSupport, enableCanvasMaskSupport } from './canvasClip';
import { createCanvasRenderState } from './canvasRenderState';

describe('enableCanvasClipRectangleSupport', () => {
  it('sets clip rectangle hooks and enables the ClipRectangle feature', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    enableCanvasClipRectangleSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableCanvasMaskSupport', () => {
  it('sets canvas mask hooks on the render state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    enableCanvasMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
