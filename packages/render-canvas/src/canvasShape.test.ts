import { beginFill, createShapeData, drawRect, endFill, lineStyle } from '@flighthq/scenegraph-display';

import { renderCanvasShapeCommands } from './canvasShape';
import { defaultCanvasShapeCommands } from './canvasShapeCommands';
import { registerCanvasShapeCommands } from './canvasShapeRegistry';

beforeAll(() => {
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
});

function makeContext(): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  return canvas.getContext('2d') as CanvasRenderingContext2D;
}

describe('renderCanvasShapeCommands', () => {
  it('does nothing when the command list is empty', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    renderCanvasShapeCommands(ctx, createShapeData().commands);
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls fill after beginFill + drawRect + endFill', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const data = createShapeData();
    beginFill(data, 0xff0000);
    drawRect(data, 0, 0, 100, 50);
    endFill(data);
    renderCanvasShapeCommands(ctx, data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('calls stroke once when lineStyle is set', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'stroke');
    const data = createShapeData();
    lineStyle(data, 2, 0x000000);
    drawRect(data, 0, 0, 100, 50);
    endFill(data);
    renderCanvasShapeCommands(ctx, data.commands);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('draws fill before stroke so strokes render on top', () => {
    const ctx = makeContext();
    const order: string[] = [];
    vi.spyOn(ctx, 'fill').mockImplementation(() => {
      order.push('fill');
    });
    vi.spyOn(ctx, 'stroke').mockImplementation(() => {
      order.push('stroke');
    });
    const data = createShapeData();
    lineStyle(data, 2, 0x000000);
    beginFill(data, 0xff0000);
    drawRect(data, 0, 0, 100, 50);
    endFill(data);
    renderCanvasShapeCommands(ctx, data.commands);
    expect(order).toEqual(['fill', 'stroke']);
  });

  it('calls fill with evenodd winding rule by default', () => {
    const ctx = makeContext();
    const spy = vi.spyOn(ctx, 'fill');
    const data = createShapeData();
    beginFill(data, 0xff0000, 1);
    drawRect(data, 0, 0, 10, 10);
    endFill(data);
    renderCanvasShapeCommands(ctx, data.commands);
    expect(spy).toHaveBeenCalledWith('evenodd');
  });
});
