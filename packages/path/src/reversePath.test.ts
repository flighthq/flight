import { PathCommand } from '@flighthq/types';

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { reversePath } from './reversePath';

describe('reversePath', () => {
  it('reverses a simple open polyline', () => {
    // Source: moveTo(0,0) → lineTo(10,0) → lineTo(10,10)
    // Reversed: moveTo(10,10) → lineTo(10,0) → lineTo(0,0)
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 10);
    const out = createPath();
    reversePath(source, out);
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.LINE_TO]);
    expect(out.data).toStrictEqual([10, 10, 10, 0, 0, 0]);
  });

  it('preserves the closed flag', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 10, 0);
    appendPathLineTo(source, 10, 10);
    appendPathClose(source);
    const out = createPath();
    reversePath(source, out);
    expect(out.commands[out.commands.length - 1]).toBe(PathCommand.CLOSE);
  });

  it('copies the winding rule', () => {
    const source = createPath('evenOdd');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 1, 0);
    const out = createPath('nonZero');
    reversePath(source, out);
    expect(out.winding).toBe('evenOdd');
  });

  it('is alias-safe when out is the same as source', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathLineTo(path, 20, 0);
    reversePath(path, path);
    expect(path.data[0]).toBe(20);
    expect(path.data[1]).toBe(0);
    expect(path.data[4]).toBe(0);
    expect(path.data[5]).toBe(0);
  });
});
