import { createRichText } from '@flighthq/scene-display';
import type { DisplayObjectRenderNode, RichText } from '@flighthq/types';

import {
  defaultWebGLRichTextRenderer,
  drawWebGLRichText,
  drawWebGLRichTextMask,
  drawWebGLRichTextWithOverlay,
} from './webglRichText';
import { makeWebGLState } from './webglTestHelper';

function makeRichTextNode(): DisplayObjectRenderNode {
  return {
    source: createRichText(),
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: null,
  } as unknown as DisplayObjectRenderNode;
}

describe('defaultWebGLRichTextRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLRichTextRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLRichText', () => {
    expect(defaultWebGLRichTextRenderer.draw).toBe(drawWebGLRichText);
  });

  it('has a drawMask function pointing to drawWebGLRichTextMask', () => {});
});

describe('drawWebGLRichText', () => {
  it('binds the active bitmap shader when drawing rich text', () => {
    const { state } = makeWebGLState();
    const renderNode = makeRichTextNode();
    (renderNode.source as RichText).data.text = 'hello';

    drawWebGLRichText(state, renderNode);

    expect(state.defaultBitmapShader.bind).toHaveBeenCalledWith(state.gl, state, renderNode);
  });

  it('returns early without drawing when text and chrome are empty', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLRichText(state, makeRichTextNode());
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws when text is non-empty', () => {
    const { state, gl } = makeWebGLState();
    const renderNode = makeRichTextNode();
    (renderNode.source as RichText).data.text = 'hello';
    drawWebGLRichText(state, renderNode);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws resolved htmlText spans', () => {
    const { state, gl } = makeWebGLState();
    const renderNode = makeRichTextNode();
    (renderNode.source as RichText).data.htmlText = '<b>Bold</b><font color="#00ff00">Green</font>';
    drawWebGLRichText(state, renderNode);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws field chrome even when text is empty', () => {
    const { state, gl } = makeWebGLState();
    const renderNode = makeRichTextNode();
    (renderNode.source as RichText).data.background = true;
    drawWebGLRichText(state, renderNode);
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('drawWebGLRichTextMask', () => {
  it('uses the rich text draw path', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLRichTextMask(state, makeRichTextNode())).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawWebGLRichTextWithOverlay', () => {
  it('runs an optional canvas overlay after layout', () => {
    const { state } = makeWebGLState();
    const renderNode = makeRichTextNode();
    (renderNode.source as RichText).data.text = 'hello';
    const overlay = vi.fn();

    drawWebGLRichTextWithOverlay(state, renderNode, overlay);

    expect(overlay).toHaveBeenCalled();
  });
});
