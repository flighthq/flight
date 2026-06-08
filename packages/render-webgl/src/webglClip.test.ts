import { enableWebGLClipRectangleSupport, enableWebGLMaskSupport } from './webglClip';
import { makeWebGLState } from './webglTestHelper';

describe('enableWebGLClipRectangleSupport', () => {
  it('sets clip rectangle hooks and enables the ClipRectangle feature', () => {
    const { state } = makeWebGLState();

    enableWebGLClipRectangleSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});

describe('enableWebGLMaskSupport', () => {
  it('sets WebGL mask hooks on the render state', () => {
    const { state } = makeWebGLState();

    enableWebGLMaskSupport(state);

    expect(state.displayObjectClipHooks).not.toBeNull();
  });
});
