import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
import { createText } from '@flighthq/scene-display';
import type { DisplayObject, DisplayObjectRenderNode } from '@flighthq/types';

import { setWebGLShader } from './webglShaderBinding';
import { makeWebGLState } from './webglTestHelper';
import { defaultWebGLTextRenderer, drawWebGLText, drawWebGLTextMask } from './webglText';

function makeTextNode(text = '', textFormat = {}): DisplayObjectRenderNode {
  const source = createText();
  source.data.text = text;
  source.data.textFormat = textFormat;
  return {
    source,
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: null,
  } as unknown as DisplayObjectRenderNode;
}

describe('defaultWebGLTextRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLTextRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLText', () => {
    expect(defaultWebGLTextRenderer.draw).toBe(drawWebGLText);
  });

  it('has a drawMask function pointing to drawWebGLTextMask', () => {});
});

describe('drawWebGLText', () => {
  it('binds the active bitmap shader when drawing text', () => {
    const { state } = makeWebGLState();
    const renderNode = makeTextNode('hello');

    drawWebGLText(state, renderNode);

    expect(state.defaultBitmapShader.bind).toHaveBeenCalledWith(state.gl, state, renderNode);
  });

  it('uses a per-node bound shader instead of the default', () => {
    const { state } = makeWebGLState();
    const source = createText();
    source.data.text = 'hello';
    source.data.textFormat = {};
    const node = source as unknown as DisplayObject;
    const customShader = { locations: state.shaderLoc, program: state.shaderLoc.program, bind: vi.fn() };
    setWebGLShader(state, node, customShader);

    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    renderNode.alpha = 1;
    renderNode.blendMode = 0;

    drawWebGLText(state, renderNode);

    expect(customShader.bind).toHaveBeenCalled();
    expect(state.defaultBitmapShader.bind).not.toHaveBeenCalled();
  });

  it('returns early without drawing when text is empty', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLText(state, makeTextNode(''));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawWebGLTextMask', () => {
  it('uses the text draw path', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLTextMask(state, makeTextNode(''))).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});
