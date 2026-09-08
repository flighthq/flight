import { PathCommand } from '@flighthq/types/contract';

import { decimatePath } from './decimatePath';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('decimatePath', () => {
  it('keeps a straight line unchanged', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    decimatePath(source, 1, out);
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data).toStrictEqual([0, 0, 100, 0]);
  });

  it('simplifies a noisy straight line', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 25, 0.1);
    appendPathLineTo(source, 50, -0.1);
    appendPathLineTo(source, 75, 0.05);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    decimatePath(source, 1, out);
    expect(out.commands).toStrictEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO]);
    expect(out.data[0]).toBe(0);
    expect(out.data[2]).toBe(100);
  });

  it('keeps all points when tolerance is 0', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 10);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    decimatePath(source, 0, out);
    expect(out.commands).toHaveLength(3);
    expect(out.data).toStrictEqual([0, 0, 50, 10, 100, 0]);
  });

  it('preserves closed paths', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    appendPathLineTo(source, 100, 100);
    appendPathLineTo(source, 0, 100);
    appendPathClose(source);
    const out = createPath();
    decimatePath(source, 1, out);
    expect(out.commands[out.commands.length - 1]).toBe(PathCommand.CLOSE);
  });

  it('preserves winding rule', () => {
    const source = createPath('evenOdd');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    decimatePath(source, 1, out);
    expect(out.winding).toBe('evenOdd');
  });

  it('handles an empty path', () => {
    const out = createPath();
    decimatePath(createPath(), 1, out);
    expect(out.commands).toStrictEqual([]);
  });

  it('is alias-safe when source and out are the same path', () => {
    const path = createPath('evenOdd');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 25, 0.1);
    appendPathLineTo(path, 50, -0.1);
    appendPathLineTo(path, 100, 0);
    const expected = createPath();
    decimatePath(path, 1, expected);

    decimatePath(path, 1, path);

    expect(path.commands).toStrictEqual(expected.commands);
    expect(path.data).toStrictEqual(expected.data);
    expect(path.winding).toBe(expected.winding);
  });
});
