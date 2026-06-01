import { registerWebGLColorTransformShader } from './webglMaterials';
import { makeWebGLState } from './webglTestHelper';

describe('registerWebGLColorTransformShader', () => {
  it('registers a color transform shader on the render state', () => {
    const { state } = makeWebGLState();

    registerWebGLColorTransformShader(state);

    expect(state.colorTransformBitmapShader).toBeDefined();
  });

  it('uses the color transform shader as the state default shader after registration', () => {
    const { state } = makeWebGLState();

    registerWebGLColorTransformShader(state);

    expect(state.defaultBitmapShader).toBe(state.colorTransformBitmapShader);
  });

  it('includes color transform uniform locations', () => {
    const { state } = makeWebGLState();

    registerWebGLColorTransformShader(state);

    expect(state.colorTransformBitmapShader?.locations.locColorMultiplier).toBeDefined();
    expect(state.colorTransformBitmapShader?.locations.locColorOffset).toBeDefined();
    expect(state.colorTransformBitmapShader?.locations.locHasColorTransform).toBeDefined();
  });

  it('binds color transform uniforms from the registered shader callback', () => {
    const { state, gl } = makeWebGLState();
    const renderNode = {
      alpha: 0.75,
      colorTransform: {
        redMultiplier: 0.5,
        greenMultiplier: 0.25,
        blueMultiplier: 1.5,
        alphaMultiplier: 0.8,
        redOffset: 10,
        greenOffset: 20,
        blueOffset: 30,
        alphaOffset: 40,
      },
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      useColorTransform: true,
    };

    registerWebGLColorTransformShader(state);
    state.defaultBitmapShader.bind(gl, state, renderNode as never);

    const loc = state.defaultBitmapShader.locations;
    expect(gl.uniform1i).toHaveBeenCalledWith(loc.locHasColorTransform, 1);
    expect(gl.uniform4f).toHaveBeenCalledWith(loc.locColorMultiplier, 0.5, 0.25, 1.5, 0.8);
    expect(gl.uniform4f).toHaveBeenCalledWith(loc.locColorOffset, 10 / 255, 20 / 255, 30 / 255, 40 / 255);
  });

  it('does not replace an existing color transform shader', () => {
    const { state } = makeWebGLState();

    registerWebGLColorTransformShader(state);
    const first = state.colorTransformBitmapShader;
    registerWebGLColorTransformShader(state);

    expect(state.colorTransformBitmapShader).toBe(first);
  });
});
