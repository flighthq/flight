import { createInputText, getInputTextRuntime } from '@flighthq/scenegraph-display';
import { setInputTextSelection } from '@flighthq/text-input';
import type { DisplayObjectRenderNode, InputText } from '@flighthq/types';

import { defaultWebGLInputTextRenderer, drawWebGLInputText } from './webglInputText';
import { makeWebGLState } from './webglTestHelper';

function makeInputTextNode(): DisplayObjectRenderNode {
  return {
    source: createInputText({ data: { height: 40, text: 'hello', width: 100 } }),
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    rendererData: null,
  } as unknown as DisplayObjectRenderNode;
}

describe('defaultWebGLInputTextRenderer', () => {
  it('uses the InputText draw function', () => {
    expect(defaultWebGLInputTextRenderer.draw).toBe(drawWebGLInputText);
  });
});

describe('drawWebGLInputText', () => {
  it('renders a focused collapsed selection without throwing', () => {
    const { state, gl } = makeWebGLState();
    const renderNode = makeInputTextNode();
    const source = renderNode.source as InputText;
    (getInputTextRuntime(source) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(source, 2, 2);

    expect(() => drawWebGLInputText(state, renderNode)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });

  it('renders a focused expanded selection without throwing', () => {
    const { state, gl } = makeWebGLState();
    const renderNode = makeInputTextNode();
    const source = renderNode.source as InputText;
    (getInputTextRuntime(source) as ReturnType<typeof getInputTextRuntime> & { focused: boolean }).focused = true;
    setInputTextSelection(source, 1, 4);

    expect(() => drawWebGLInputText(state, renderNode)).not.toThrow();
    expect(gl.drawElements).toHaveBeenCalled();
  });
});
