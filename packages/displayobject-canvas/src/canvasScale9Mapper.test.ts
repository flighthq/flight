import { appendShapeRectangle, createShape } from '@flighthq/shape';

import { buildScale9Mapper } from './canvasScale9Mapper';

function makeGrid(x: number, y: number, width: number, height: number) {
  return { x, y, width, height } as never;
}

describe('buildScale9Mapper', () => {
  it('returns null when scaleX is zero', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 0, 0, 100, 100);
    expect(buildScale9Mapper(shape.data.commands, makeGrid(10, 10, 80, 80), 0, 1)).toBeNull();
  });

  it('returns null when scaleY is negative', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 0, 0, 100, 100);
    expect(buildScale9Mapper(shape.data.commands, makeGrid(10, 10, 80, 80), 1, -1)).toBeNull();
  });

  it('returns null when commands have no drawable points', () => {
    const shape = createShape();
    expect(buildScale9Mapper(shape.data.commands, makeGrid(10, 10, 80, 80), 2, 2)).toBeNull();
  });

  it('maps corner coordinates unchanged (start region)', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(shape.data.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    expect(mapper).not.toBeNull();
    // x=5 is in the start (corner) region â€” should not move
    expect(mapper.mapX(5)).toBeCloseTo(5);
    expect(mapper.mapY(5)).toBeCloseTo(5);
  });

  it('maps end-region coordinates by adding scaled center size', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(shape.data.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    // With scaleX=2, boundsWidth=100: size=200, corner=10, end=10, center=180
    // pos=95 is in end region (>= 10+80=90): should be 10 + 180 + (95-90) = 195
    expect(mapper.mapX(95)).toBeCloseTo(195);
  });

  it('stretches center-region coordinates proportionally', () => {
    const shape = createShape();
    appendShapeRectangle(shape, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(shape.data.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    // pos=50 is center (between 10 and 90): 10 + 180*(50-10)/80 = 10 + 90 = 100
    expect(mapper.mapX(50)).toBeCloseTo(100);
  });
});
