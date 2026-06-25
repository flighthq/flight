import { appendPathCubicCurveTo, appendPathCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { transformPath, translatePath } from './transformPath';

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

describe('transformPath', () => {
  it('identity matrix leaves all coordinates unchanged', () => {
    const source = createPath();
    appendPathMoveTo(source, 10, 20);
    appendPathLineTo(source, 30, 40);
    const out = createPath();
    transformPath(source, IDENTITY, out);
    expect(out.data).toStrictEqual([10, 20, 30, 40]);
  });

  it('applies a translation to MOVE_TO and LINE_TO points', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    const out = createPath();
    transformPath(source, { a: 1, b: 0, c: 0, d: 1, tx: 5, ty: 3 }, out);
    expect(out.data).toStrictEqual([5, 3, 15, 3]);
  });

  it('applies a scale to CURVE_TO control and anchor points', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathCurveTo(source, 10, 20, 30, 0);
    const out = createPath();
    transformPath(source, { a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0 }, out);
    // MOVE_TO (0,0) scaled to (0,0); CURVE_TO (10,20,30,0) → (20,40,60,0)
    expect(out.data).toStrictEqual([0, 0, 20, 40, 60, 0]);
  });

  it('applies a scale to CUBIC_CURVE_TO points', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathCubicCurveTo(source, 10, 0, 20, 0, 30, 0);
    const out = createPath();
    transformPath(source, { a: 3, b: 0, c: 0, d: 3, tx: 0, ty: 0 }, out);
    expect(out.data).toStrictEqual([0, 0, 30, 0, 60, 0, 90, 0]);
  });

  it('is alias-safe: out may be the same object as source', () => {
    const path = createPath();
    appendPathMoveTo(path, 5, 10);
    appendPathLineTo(path, 15, 20);
    transformPath(path, { a: 1, b: 0, c: 0, d: 1, tx: 100, ty: 200 }, path);
    expect(path.data).toStrictEqual([105, 210, 115, 220]);
  });

  it('copies winding and commands from source to out', () => {
    const source = createPath('evenOdd');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 1, 1);
    const out = createPath('nonZero');
    transformPath(source, IDENTITY, out);
    expect(out.winding).toBe('evenOdd');
    expect(out.commands).toStrictEqual(source.commands);
  });
});

describe('translatePath', () => {
  it('shifts all points by (dx, dy)', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 10);
    const out = createPath();
    translatePath(source, 5, -3, out);
    expect(out.data).toStrictEqual([5, -3, 15, 7]);
  });

  it('is alias-safe', () => {
    const path = createPath();
    appendPathMoveTo(path, 1, 2);
    translatePath(path, 10, 20, path);
    expect(path.data).toStrictEqual([11, 22]);
  });
});
