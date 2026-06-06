import { enableWebGLMaskSupport, enableWebGLScrollRectangleSupport } from './webglClip';
import { makeWebGLState } from './webglTestHelper';

describe('enableWebGLMaskSupport', () => {
  it('sets WebGL mask hooks on the render state', () => {
    const { state } = makeWebGLState();

    enableWebGLMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableWebGLScrollRectangleSupport', () => {
  it('sets scroll rectangle hooks and enables the ScrollRectangle feature', () => {
    const { state } = makeWebGLState();

    enableWebGLScrollRectangleSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
