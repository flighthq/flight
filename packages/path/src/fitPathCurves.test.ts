import { PathCommand } from '@flighthq/types/contract';

import { fitPathCurves } from './fitPathCurves';
import { appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('fitPathCurves', () => {
  it('keeps a straight line as a line', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    fitPathCurves(source, 1, out);
    expect(out.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(out.commands).not.toContain(PathCommand.CLOSE);
    const lastX = out.data[out.data.length - 2];
    const lastY = out.data[out.data.length - 1];
    expect(lastX).toBeCloseTo(100);
    expect(lastY).toBeCloseTo(0);
  });

  it('produces smooth curves from a circle-like polyline', () => {
    const source = createPath();
    const n = 16;
    const r = 50;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) appendPathMoveTo(source, x, y);
      else appendPathLineTo(source, x, y);
    }
    const out = createPath();
    fitPathCurves(source, 1, out);
    expect(out.commands).toContain(PathCommand.CUBIC_CURVE_TO);
    const cubicCount = out.commands.filter((c) => c === PathCommand.CUBIC_CURVE_TO).length;
    expect(cubicCount).toBeLessThan(n);
  });

  it('handles a single segment', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 100);
    const out = createPath();
    fitPathCurves(source, 1, out);
    expect(out.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(out.data).toContain(100);
  });

  it('handles an empty path', () => {
    const out = createPath();
    fitPathCurves(createPath(), 1, out);
    expect(out.commands).toStrictEqual([]);
  });

  it('is alias-safe when source and out are the same path', () => {
    const path = createPath('evenOdd');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 25, 20);
    appendPathLineTo(path, 50, 30);
    appendPathLineTo(path, 75, 20);
    appendPathLineTo(path, 100, 0);
    const expected = createPath();
    fitPathCurves(path, 1, expected);

    fitPathCurves(path, 1, path);

    expect(path.commands).toStrictEqual(expected.commands);
    expect(path.data).toStrictEqual(expected.data);
    expect(path.winding).toBe(expected.winding);
  });

  it('preserves winding rule', () => {
    const source = createPath('evenOdd');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    appendPathLineTo(source, 100, 100);
    const out = createPath();
    fitPathCurves(source, 1, out);
    expect(out.winding).toBe('evenOdd');
  });
});
