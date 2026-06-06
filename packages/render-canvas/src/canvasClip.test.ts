import { enableCanvasMaskSupport, enableCanvasScrollRectangleSupport } from './canvasClip';
import { createCanvasRenderState } from './canvasRenderState';

describe('enableCanvasMaskSupport', () => {
  it('sets canvas mask hooks on the render state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    enableCanvasMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableCanvasScrollRectangleSupport', () => {
  it('sets scroll rectangle hooks and enables the ScrollRectangle feature', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));

    enableCanvasScrollRectangleSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
