import type { DisplayObjectRenderNode } from '@flighthq/types';

import { defaultWebGLBitmapRenderer, drawWebGLBitmap, drawWebGLBitmapMask } from './webglBitmap';
import { makeWebGLState } from './webglTestHelper';

function makeRenderNode(image: unknown = null): DisplayObjectRenderNode {
  return {
    source: { data: { image } },
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: null,
  } as unknown as DisplayObjectRenderNode;
}

function makeImageSource(src: unknown = null, width = 32, height = 32) {
  return { src, width, height };
}

describe('defaultWebGLBitmapRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLBitmapRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLBitmap', () => {
    expect(defaultWebGLBitmapRenderer.draw).toBe(drawWebGLBitmap);
  });

  it('has a drawMask function pointing to drawWebGLBitmapMask', () => {});
});

describe('drawWebGLBitmap', () => {
  it('returns early without drawing when image is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLBitmap(state, makeRenderNode(null));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when image.src is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLBitmap(state, makeRenderNode(makeImageSource(null)));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('calls drawElements when image source is valid', () => {
    const { state, gl } = makeWebGLState();
    const img = document.createElement('img');
    drawWebGLBitmap(state, makeRenderNode(makeImageSource(img)));
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('calls defaultBitmapShader.bind with the render node', () => {
    const { state } = makeWebGLState();
    const img = document.createElement('img');
    const node = makeRenderNode(makeImageSource(img));
    drawWebGLBitmap(state, node);
    expect(state.defaultBitmapShader.bind).toHaveBeenCalledWith(state.gl, state, node);
  });
});

describe('drawWebGLBitmapMask', () => {
  it('uses the bitmap draw path', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLBitmapMask(state, makeRenderNode(null))).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});
