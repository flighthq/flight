import { createGraphics } from './graphics';
import {
  beginFill,
  cubicCurveTo,
  curveTo,
  drawCircle,
  drawEllipse,
  drawRect,
  drawRoundRect,
  endFill,
  lineStyle,
  lineTo,
  moveTo,
} from './graphicsCommands';

describe('beginFill', () => {
  it('pushes a beginFill command with color and alpha', () => {
    const g = createGraphics();
    beginFill(g, 0xff0000, 0.5);
    expect(g.commands[0]).toEqual({ type: 'beginFill', color: 0xff0000, alpha: 0.5 });
  });

  it('defaults to color 0 and alpha 1', () => {
    const g = createGraphics();
    beginFill(g);
    expect(g.commands[0]).toEqual({ type: 'beginFill', color: 0, alpha: 1 });
  });
});

describe('cubicCurveTo', () => {
  it('pushes a cubicCurveTo command with all control and anchor points', () => {
    const g = createGraphics();
    cubicCurveTo(g, 10, 20, 30, 40, 50, 60);
    expect(g.commands[0]).toEqual({
      type: 'cubicCurveTo',
      controlX1: 10,
      controlY1: 20,
      controlX2: 30,
      controlY2: 40,
      anchorX: 50,
      anchorY: 60,
    });
  });
});

describe('curveTo', () => {
  it('pushes a curveTo command with control and anchor points', () => {
    const g = createGraphics();
    curveTo(g, 10, 20, 30, 40);
    expect(g.commands[0]).toEqual({ type: 'curveTo', controlX: 10, controlY: 20, anchorX: 30, anchorY: 40 });
  });
});

describe('drawCircle', () => {
  it('pushes a drawCircle command with position and radius', () => {
    const g = createGraphics();
    drawCircle(g, 50, 50, 25);
    expect(g.commands[0]).toEqual({ type: 'drawCircle', x: 50, y: 50, radius: 25 });
  });
});

describe('drawEllipse', () => {
  it('pushes a drawEllipse command with position and dimensions', () => {
    const g = createGraphics();
    drawEllipse(g, 10, 20, 100, 50);
    expect(g.commands[0]).toEqual({ type: 'drawEllipse', x: 10, y: 20, width: 100, height: 50 });
  });
});

describe('drawRect', () => {
  it('pushes a drawRect command with position and dimensions', () => {
    const g = createGraphics();
    drawRect(g, 10, 20, 100, 50);
    expect(g.commands[0]).toEqual({ type: 'drawRect', x: 10, y: 20, width: 100, height: 50 });
  });
});

describe('drawRoundRect', () => {
  it('pushes a drawRoundRect command with position, dimensions, and corner radii', () => {
    const g = createGraphics();
    drawRoundRect(g, 0, 0, 100, 50, 10, 8);
    expect(g.commands[0]).toEqual({
      type: 'drawRoundRect',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      ellipseWidth: 10,
      ellipseHeight: 8,
    });
  });
});

describe('endFill', () => {
  it('pushes an endFill command', () => {
    const g = createGraphics();
    endFill(g);
    expect(g.commands[0]).toEqual({ type: 'endFill' });
  });
});

describe('lineStyle', () => {
  it('pushes a lineStyle command with thickness, color, and alpha', () => {
    const g = createGraphics();
    lineStyle(g, 2, 0x0000ff, 0.8);
    expect(g.commands[0]).toEqual({ type: 'lineStyle', thickness: 2, color: 0x0000ff, alpha: 0.8 });
  });

  it('defaults to thickness 1, color 0, alpha 1', () => {
    const g = createGraphics();
    lineStyle(g);
    expect(g.commands[0]).toEqual({ type: 'lineStyle', thickness: 1, color: 0, alpha: 1 });
  });
});

describe('lineTo', () => {
  it('pushes a lineTo command with position', () => {
    const g = createGraphics();
    lineTo(g, 100, 200);
    expect(g.commands[0]).toEqual({ type: 'lineTo', x: 100, y: 200 });
  });
});

describe('moveTo', () => {
  it('pushes a moveTo command with position', () => {
    const g = createGraphics();
    moveTo(g, 10, 20);
    expect(g.commands[0]).toEqual({ type: 'moveTo', x: 10, y: 20 });
  });
});
