import { flushWebGLSpriteBatch, prepareWebGLSpriteBatchWrite } from './webglSpriteBatch';
import { makeWebGLState } from './webglTestHelper';

function makeTexture(): HTMLImageElement {
  return document.createElement('img');
}

describe('flushWebGLSpriteBatch', () => {
  it('does nothing when batch count is zero', () => {
    const { state, gl } = makeWebGLState();
    flushWebGLSpriteBatch(state as any);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws when instances are pending and resets state', () => {
    const { state, gl } = makeWebGLState();
    const internal = state as any;
    const tex = makeTexture();

    prepareWebGLSpriteBatchWrite(internal, tex, null, null, 1);
    internal.spriteBatchCount = 1;
    flushWebGLSpriteBatch(internal);

    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
    expect(internal.spriteBatchCount).toBe(0);
    expect(internal.spriteBatchTexture).toBeNull();
    expect(internal.spriteBatchBlendMode).toBeNull();
  });
});

describe('prepareWebGLSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', () => {
    const { state } = makeWebGLState();
    const internal = state as any;
    const tex = makeTexture();

    const base = prepareWebGLSpriteBatchWrite(internal, tex, null, null, 2);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', () => {
    const { state, gl } = makeWebGLState();
    const internal = state as any;
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareWebGLSpriteBatchWrite(internal, tex1, null, null, 1);
    internal.spriteBatchCount = 1;

    prepareWebGLSpriteBatchWrite(internal, tex2, null, null, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(internal.spriteBatchTexture).toBe(tex2);
  });

  it('flushes when color transform changes', () => {
    const { state, gl } = makeWebGLState();
    const internal = state as any;
    const tex = makeTexture();
    const ct = {
      redMultiplier: 1,
      greenMultiplier: 0.5,
      blueMultiplier: 1,
      alphaMultiplier: 1,
      redOffset: 0,
      greenOffset: 0,
      blueOffset: 0,
      alphaOffset: 0,
    } as any;

    prepareWebGLSpriteBatchWrite(internal, tex, null, ct, 1);
    internal.spriteBatchCount = 1;

    prepareWebGLSpriteBatchWrite(internal, tex, null, null, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(internal.spriteBatchColorTransform).toBeNull();
  });

  it('grows instance data when capacity is exceeded', () => {
    const { state } = makeWebGLState();
    const internal = state as any;
    const tex = makeTexture();
    const initialFloats = internal.spriteBatchInstanceData.length;

    prepareWebGLSpriteBatchWrite(internal, tex, null, null, initialFloats + 100);

    expect(internal.spriteBatchInstanceData.length).toBeGreaterThan(initialFloats);
  });
});
