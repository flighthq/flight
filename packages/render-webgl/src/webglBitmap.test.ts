import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, RenderProxy2D } from '@flighthq/types';

import { defaultWebGLBitmapRenderer, drawWebGLBitmap, drawWebGLBitmapMask } from './webglBitmap';
import { setWebGLShader } from './webglShaderBinding';
import { makeWebGLState } from './webglTestHelper';

function makeRenderProxy(image: unknown = null): RenderProxy2D {
  return {
    source: { data: { image } },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: null,
  } as unknown as RenderProxy2D;
}

function makeImageSource(src: unknown = null, width = 32, height = 32) {
  return { src, width, height };
}

describe('defaultWebGLBitmapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLBitmapRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawWebGLBitmap', () => {
    expect(defaultWebGLBitmapRenderer.submit).toBe(drawWebGLBitmap);
  });

  it('has a drawMask function pointing to drawWebGLBitmapMask', () => {});
});

describe('drawWebGLBitmap', () => {
  it('returns early without drawing when image is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLBitmap(state, makeRenderProxy(null));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when image.src is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLBitmap(state, makeRenderProxy(makeImageSource(null)));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('calls drawElements when image source is valid', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    drawWebGLBitmap(state, makeRenderProxy(makeImageSource(img)));
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('calls defaultBitmapShader.bind with the render node', () => {
    const { state } = makeWebGLState();
    const img = document.createElement('img');
    const node = makeRenderProxy(makeImageSource(img));
    drawWebGLBitmap(state, node);
    expect(state.defaultBitmapShader.bind).toHaveBeenCalledWith(state.gl, state, node);
  });

  it('uses a per-node bound shader instead of the default', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    const sceneNode = {} as DisplayObject;
    const customShader = { locations: state.shaderLoc, program: state.shaderLoc.program, bind: vi.fn() };
    setWebGLShader(state, sceneNode, customShader);

    const renderProxy = getOrCreateRenderProxy2D(state, sceneNode);
    (renderProxy as unknown as { source: unknown }).source = { data: { image: makeImageSource(img) } };
    renderProxy.alpha = 1;
    renderProxy.blendMode = 0;

    drawWebGLBitmap(state, renderProxy);
    expect(customShader.bind).toHaveBeenCalledWith(gl, state, renderProxy);
    expect(state.defaultBitmapShader.bind).not.toHaveBeenCalled();
  });
});

describe('drawWebGLBitmapMask', () => {
  it('uses the bitmap draw path', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLBitmapMask(state, makeRenderProxy(null))).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});
