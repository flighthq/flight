import { registerNodeRenderer } from '@flighthq/render/contract';
import { getOrCreateRenderProxy2D } from '@flighthq/render/contract';
import { appendShapeBeginFill, appendShapeRectangle, createScale9Shape } from '@flighthq/shape/contract';
import { Scale9ShapeKind } from '@flighthq/types/contract';

import { buildScale9Mapper } from './canvasScale9Mapper.ts';
import { canvasScale9ShapeRenderer, drawCanvasScale9Shape } from './canvasScale9Shape.ts';
import { canvasShapeCommands } from './canvasShapeCommands.ts';
import { registerCanvasShapeCommands } from './canvasShapeRegistry.ts';
import { createCanvasRenderState } from './canvasTestSupport.ts';

const grid = { x: 10, y: 10, width: 80, height: 80 };

describe('drawCanvasScale9Shape', () => {
  it('does not throw when commands list is empty', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const state = createCanvasRenderState(canvas);
    registerCanvasShapeCommands(state, canvasShapeCommands);
    registerNodeRenderer(state, Scale9ShapeKind, canvasScale9ShapeRenderer);
    const shape = createScale9Shape(grid);
    const data = getOrCreateRenderProxy2D(state, shape);
    expect(() => drawCanvasScale9Shape(state, data)).not.toThrow();
  });
});
