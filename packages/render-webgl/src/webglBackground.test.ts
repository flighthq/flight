import { renderWebGLBackground } from './webglBackground';
import { makeWebGLState } from './webglTestHelper';

describe('renderWebGLBackground', () => {
  it('calls clearColor with zeros when background alpha is 0', () => {
    const { state, gl } = makeWebGLState({ backgroundColorRGBA: [0, 0, 0, 0] });
    renderWebGLBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 0);
  });

  it('calls clearColor with the RGBA values when background is non-transparent', () => {
    const { state, gl } = makeWebGLState({ backgroundColorRGBA: [1, 0, 0, 1] });
    renderWebGLBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(1, 0, 0, 1);
  });

  it('calls clearColor with zeros when RGBA array has fewer than 4 elements', () => {
    const { state, gl } = makeWebGLState({ backgroundColorRGBA: [] });
    renderWebGLBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(0, 0, 0, 0);
  });

  it('always calls gl.clear with COLOR_BUFFER_BIT', () => {
    const { state, gl } = makeWebGLState();
    renderWebGLBackground(state);
    expect(gl.clear).toHaveBeenCalledWith((gl as unknown as { COLOR_BUFFER_BIT: number }).COLOR_BUFFER_BIT);
  });

  it('resets currentBlendMode to null', () => {
    const { state } = makeWebGLState();
    state.currentBlendMode = 0;
    renderWebGLBackground(state);
    expect(state.currentBlendMode).toBeNull();
  });

  it('passes fractional RGBA values through unchanged', () => {
    const { state, gl } = makeWebGLState({ backgroundColorRGBA: [0.5, 0.25, 0.75, 0.8] });
    renderWebGLBackground(state);
    expect(gl.clearColor).toHaveBeenCalledWith(0.5, 0.25, 0.75, 0.8);
  });
});
