import type { DisplayObjectRenderNode } from '@flighthq/types';

import { makeWebGLState } from './webglTestHelper';
import { defaultWebGLTextRenderer, drawWebGLText, drawWebGLTextMask } from './webglText';

function makeTextNode(text = '', textFormat = {}): DisplayObjectRenderNode {
  return {
    source: { data: { text, textFormat } },
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

  it('has a drawMask function pointing to drawWebGLTextMask', () => {
    expect(defaultWebGLTextRenderer.drawMask).toBe(drawWebGLTextMask);
  });
});

describe('drawWebGLText', () => {
  it('returns early without drawing when text is empty', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLText(state, makeTextNode(''));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawWebGLTextMask', () => {
  it('is a no-op that does not throw', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLTextMask(state, {} as DisplayObjectRenderNode)).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});
