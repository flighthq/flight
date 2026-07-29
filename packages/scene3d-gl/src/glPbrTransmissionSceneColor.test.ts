import { setGlPbrTransmissionSceneColor } from './glPbrTransmissionSceneColor';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

describe('setGlPbrTransmissionSceneColor', () => {
  it('stores and clears the caller-owned transmission input', () => {
    const { state } = makeGlScene3DState();
    const sceneColor = { height: 64, mipLevelCount: 7, texture: {} as WebGLTexture, width: 64 };
    setGlPbrTransmissionSceneColor(state, sceneColor);
    expect(getGlScene3DRuntime(state).pbrTransmissionSceneColor).toBe(sceneColor);
    setGlPbrTransmissionSceneColor(state, null);
    expect(getGlScene3DRuntime(state).pbrTransmissionSceneColor).toBeNull();
  });
});
