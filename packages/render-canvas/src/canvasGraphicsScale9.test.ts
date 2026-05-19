import { beginFill, createGraphics, drawRect, endFill } from '@flighthq/shape';

import { buildScale9Mapper } from './canvasGraphicsScale9';
import { renderGraphicsToCanvas } from './canvasShape';

function makeGrid(x: number, y: number, width: number, height: number) {
  return { x, y, width, height } as never;
}

describe('buildScale9Mapper', () => {
  it('returns null when scaleX is zero', () => {
    const g = createGraphics();
    drawRect(g, 0, 0, 100, 100);
    expect(buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 0, 1)).toBeNull();
  });

  it('returns null when scaleY is negative', () => {
    const g = createGraphics();
    drawRect(g, 0, 0, 100, 100);
    expect(buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 1, -1)).toBeNull();
  });

  it('returns null when commands have no drawable points', () => {
    const g = createGraphics();
    expect(buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 2, 2)).toBeNull();
  });

  it('maps corner coordinates unchanged (start region)', () => {
    const g = createGraphics();
    drawRect(g, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    expect(mapper).not.toBeNull();
    // x=5 is in the start (corner) region — should not move
    expect(mapper.mapX(5)).toBeCloseTo(5);
    expect(mapper.mapY(5)).toBeCloseTo(5);
  });

  it('maps end-region coordinates by adding scaled center size', () => {
    const g = createGraphics();
    drawRect(g, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    // With scaleX=2, boundsWidth=100: size=200, corner=10, end=10, center=180
    // pos=95 is in end region (>= 10+80=90): should be 10 + 180 + (95-90) = 195
    expect(mapper.mapX(95)).toBeCloseTo(195);
  });

  it('stretches center-region coordinates proportionally', () => {
    const g = createGraphics();
    drawRect(g, 0, 0, 100, 100);
    const mapper = buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    // pos=50 is center (between 10 and 90): 10 + 180*(50-10)/80 = 10 + 90 = 100
    expect(mapper.mapX(50)).toBeCloseTo(100);
  });
});

describe('renderGraphicsToCanvas with Scale9Grid', () => {
  it('applies coordinate remapping via scale9 mapper', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const rectSpy = vi.spyOn(ctx, 'rect');

    const g = createGraphics();
    beginFill(g, 0xff0000);
    drawRect(g, 0, 0, 100, 100);
    endFill(g);

    const mapper = buildScale9Mapper(g.commands, makeGrid(10, 10, 80, 80), 2, 2)!;
    renderGraphicsToCanvas(ctx, g, mapper);

    // x0=0 → mapX(0)=0, y0=0 → mapY(0)=0
    // x1=100 → mapX(100)=200 (end region: 10+180+(100-90)=200), y1 same
    expect(rectSpy).toHaveBeenCalledWith(0, 0, 200, 200);
  });
});
