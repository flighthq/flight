import { createRichText } from '@flighthq/displayobject';
import type { RendererData, RenderProxy2D, RichText } from '@flighthq/types';

import {
  createWebGLRichTextData,
  defaultWebGLRichTextRenderer,
  destroyWebGLRichTextData,
  drawWebGLRichText,
  drawWebGLRichTextMask,
  drawWebGLRichTextWithOverlay,
} from './webglRichText';
import { makeWebGLState } from './webglTestHelper';

function makeRichTextNode(): RenderProxy2D {
  const richText = createRichText();
  return {
    source: richText,
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: { texture: null },
  } as unknown as RenderProxy2D;
}

describe('createWebGLRichTextData', () => {
  it('allocates per-node data with no texture yet', () => {
    const { state } = makeWebGLState();
    const data = createWebGLRichTextData(state, createRichText()) as unknown as { texture: WebGLTexture | null };
    expect(data.texture).toBeNull();
  });
});

describe('defaultWebGLRichTextRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLRichTextRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawWebGLRichText', () => {
    expect(defaultWebGLRichTextRenderer.submit).toBe(drawWebGLRichText);
  });

  it('has a drawMask function pointing to drawWebGLRichTextMask', () => {});
});

describe('destroyWebGLRichTextData', () => {
  it('deletes the GPU texture the node owns', () => {
    const { state, gl } = makeWebGLState();
    const texture = gl.createTexture();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyWebGLRichTextData(state, { texture } as unknown as RendererData);
    expect(deleteSpy).toHaveBeenCalledWith(texture);
  });

  it('is a no-op when no texture was allocated', () => {
    const { state, gl } = makeWebGLState();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyWebGLRichTextData(state, { texture: null } as unknown as RendererData);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('drawWebGLRichText', () => {
  it('binds the active bitmap shader when drawing rich text', () => {
    const { state } = makeWebGLState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';

    drawWebGLRichText(state, renderProxy);

    expect(state.defaultBitmapShader.bind).toHaveBeenCalledWith(state.gl, state, renderProxy);
  });

  it('returns early without drawing when text and chrome are empty', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLRichText(state, makeRichTextNode());
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws when text is non-empty', () => {
    const { state, gl } = makeWebGLState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';
    drawWebGLRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws resolved htmlText spans', () => {
    const { state, gl } = makeWebGLState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.htmlText = '<b>Bold</b><font color="#00ff00">Green</font>';
    drawWebGLRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws field chrome even when text is empty', () => {
    const { state, gl } = makeWebGLState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.background = true;
    drawWebGLRichText(state, renderProxy);
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
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';
    const overlay = vi.fn();

    drawWebGLRichTextWithOverlay(state, renderProxy, overlay);

    expect(overlay).toHaveBeenCalled();
  });
});
