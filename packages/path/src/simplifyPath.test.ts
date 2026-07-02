import { PathCommand } from '@flighthq/types';

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { simplifyPath } from './simplifyPath';

describe('simplifyPath', () => {
  it('keeps a straight line unchanged', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    simplifyPath(source, 1, out);
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
    simplifyPath(source, 1, out);
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
    simplifyPath(source, 0, out);
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
    simplifyPath(source, 1, out);
    expect(out.commands[out.commands.length - 1]).toBe(PathCommand.CLOSE);
  });

  it('preserves winding rule', () => {
    const source = createPath('evenOdd');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    simplifyPath(source, 1, out);
    expect(out.winding).toBe('evenOdd');
  });

  it('handles an empty path', () => {
    const out = createPath();
    simplifyPath(createPath(), 1, out);
    expect(out.commands).toStrictEqual([]);
  });
});
