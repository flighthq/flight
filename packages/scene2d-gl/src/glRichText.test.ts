import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createRichText } from '@flighthq/text/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import type { RendererData, RenderProxy2D, RichText } from '@flighthq/types/contract';

import {
  createGlRichTextData,
  defaultGlRichTextRenderer,
  destroyGlRichTextData,
  drawGlRichText,
  drawGlRichTextWithOverlay,
  registerGlTextInputOverlay,
} from './glRichText';
import { createGlState } from './glTestHelper';

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

describe('createGlRichTextData', () => {
  it('allocates per-node data with no texture yet', () => {
    const { state } = createGlState();
    const data = createGlRichTextData(state, createRichText()) as unknown as { texture: WebGLTexture | null };
    expect(data.texture).toBeNull();
  });
});

describe('defaultGlRichTextRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultGlRichTextRenderer.createData).toBe('function');
  });

  it('has a submit function pointing to drawGlRichText', () => {
    expect(defaultGlRichTextRenderer.submit).toBe(drawGlRichText);
  });
});

describe('destroyGlRichTextData', () => {
  it('deletes the GPU texture the node owns', () => {
    const { state, gl } = createGlState();
    const texture = gl.createTexture();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlRichTextData(state, { texture } as unknown as RendererData);
    expect(deleteSpy).toHaveBeenCalledWith(texture);
  });

  it('is a no-op when no texture was allocated', () => {
    const { state, gl } = createGlState();
    const deleteSpy = vi.spyOn(gl, 'deleteTexture');
    destroyGlRichTextData(state, { texture: null } as unknown as RendererData);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('drawGlRichText', () => {
  it('binds the active bitmap shader when drawing rich text', () => {
    const { state } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';

    // The default bitmap shader is compiled on FIRST USE and is null until then, so this first draw is
    // what brings it into existence — spying before it would attach to nothing. A `!` here would only
    // silence the type error announcing that, which is how this test previously passed typecheck and
    // failed at runtime. Draw once to force the compile, then spy on the real object and draw again.
    drawGlRichText(state, renderProxy);
    const shader = getGlRenderStateRuntime(state).defaultBitmapShader;
    expect(shader).not.toBeNull();

    const bindSpy = vi.spyOn(shader!, 'bind');
    drawGlRichText(state, renderProxy);

    expect(bindSpy).toHaveBeenCalledWith(state.gl, state, renderProxy);
  });

  it('returns early without drawing when text and chrome are empty', () => {
    const { state, gl } = createGlState();
    drawGlRichText(state, makeRichTextNode());
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('draws when text is non-empty', () => {
    const { state, gl } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';
    drawGlRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws resolved multi-format spans', () => {
    const { state, gl } = createGlState();
    const renderProxy = makeRichTextNode();
    const node = renderProxy.source as RichText;
    node.data.text = 'BoldGreen';
    node.data.textFormatRanges = [
      { start: 0, end: 4, format: { bold: true } },
      { start: 4, end: 9, format: { color: 0x00ff00ff } },
    ];
    drawGlRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('draws field chrome even when text is empty', () => {
    const { state, gl } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.background = true;
    drawGlRichText(state, renderProxy);
    expect(gl.drawElements).toHaveBeenCalled();
  });
});

describe('drawGlRichTextWithOverlay', () => {
  it('runs an optional canvas overlay after layout', () => {
    const { state } = createGlState();
    const renderProxy = makeRichTextNode();
    (renderProxy.source as RichText).data.text = 'hello';
    const overlay = vi.fn();

    drawGlRichTextWithOverlay(state, renderProxy, overlay);

    expect(overlay).toHaveBeenCalled();
  });
});

describe('registerGlTextInputOverlay', () => {
  it('invokes the registered overlay only for a RichText with an input slot', () => {
    const overlay = vi.fn();
    registerGlTextInputOverlay(overlay);
    const { state } = createGlState();

    const plain = makeRichTextNode();
    (plain.source as RichText).data.text = 'x';
    drawGlRichText(state, plain);
    expect(overlay).not.toHaveBeenCalled();

    const editable = makeRichTextNode();
    (editable.source as RichText).data.text = 'x';
    enableTextInput(editable.source as RichText);
    drawGlRichText(state, editable);
    expect(overlay).toHaveBeenCalled();
  });
});
