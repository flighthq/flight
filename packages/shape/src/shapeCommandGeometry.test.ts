import { writeShapeGeometryCommandEnd } from './shapeCommandGeometry.ts';

describe('writeShapeGeometryCommandEnd', () => {
  it('writes primitive and raw-path endpoints using canonical tuple semantics', () => {
    const out = { x: 0, y: 0 };

    expect(writeShapeGeometryCommandEnd(out, 0, 0, 'drawEllipse', ['drawEllipse', 4, 50, 25, 40, 10], 2)).toBe(true);
    expect(out).toEqual({ x: 90, y: 25 });

    expect(
      writeShapeGeometryCommandEnd(
        out,
        out.x,
        out.y,
        'drawRoundedRectangle',
        ['drawRoundedRectangle', 5, 0, 0, 100, 50, 20],
        2,
      ),
    ).toBe(true);
    expect(out).toEqual({ x: 20, y: 0 });

    expect(
      writeShapeGeometryCommandEnd(
        out,
        out.x,
        out.y,
        'drawPath',
        ['drawPath', 3, [1, 2, 7], [10, 20, 30, 40], 'nonZero'],
        2,
      ),
    ).toBe(true);
    expect(out).toEqual({ x: 10, y: 20 });
  });

  it('returns false without changing the output for a non-geometry command', () => {
    const out = { x: 3, y: 4 };

    expect(writeShapeGeometryCommandEnd(out, 0, 0, 'beginFill', ['beginFill', 2, 0, 1], 2)).toBe(false);
    expect(out).toEqual({ x: 3, y: 4 });
  });
});
