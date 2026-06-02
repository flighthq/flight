import type { DisplayObjectRenderTreeNode } from '@flighthq/types';

import { defaultWebGLShapeRenderer, drawWebGLShape, drawWebGLShapeMask } from './webglShape';
import { makeWebGLState } from './webglTestHelper';

function makeShapeNode(data: Record<string, unknown> = {}, rendererData: unknown = null): DisplayObjectRenderTreeNode {
  return {
    source: {
      data: {
        commands: [],
        version: 0,
        ...data,
      },
      // getLocalBoundsRectangle is called on source itself
    },
    rendererData: rendererData,
    blendMode: 0,
    alpha: 1,
    transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
  } as unknown as DisplayObjectRenderTreeNode;
}

describe('defaultWebGLShapeRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGLShapeRenderer.createData).toBe('function');
  });

  it('has a draw function pointing to drawWebGLShape', () => {
    expect(defaultWebGLShapeRenderer.draw).toBe(drawWebGLShape);
  });

  it('has a drawMask function pointing to drawWebGLShapeMask', () => {
    expect(defaultWebGLShapeRenderer.drawMask).toBe(drawWebGLShapeMask);
  });
});

describe('drawWebGLShape', () => {
  it('returns early without drawing when commands array is empty', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLShape(state, makeShapeNode({ commands: [] }));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });

  it('returns early without drawing when rendererData is null', () => {
    const { state, gl } = makeWebGLState();
    drawWebGLShape(state, makeShapeNode({ commands: [{}] }, null));
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});

describe('drawWebGLShapeMask', () => {
  it('uses the shape draw path', () => {
    const { state, gl } = makeWebGLState();
    expect(() => drawWebGLShapeMask(state, makeShapeNode({ commands: [] }))).not.toThrow();
    expect(gl.drawElements).not.toHaveBeenCalled();
  });
});
