import { PathCommand } from '@flighthq/types';

import { dashPath } from './dashPath';
import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from './path';

describe('dashPath', () => {
  it('produces dashed segments from a simple line', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    dashPath(source, [10, 5], 0, out);

    // Each dash-on segment starts with MOVE_TO and has LINE_TOs.
    const moves = out.commands.filter((c) => c === PathCommand.MOVE_TO);
    expect(moves.length).toBeGreaterThanOrEqual(6);
    expect(out.commands).not.toContain(PathCommand.CLOSE);
  });

  it('copies the source unchanged for an empty dash array', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 50);
    const out = createPath();
    dashPath(source, [], 0, out);

    expect(out.commands).toStrictEqual(source.commands);
    expect(out.data).toStrictEqual(source.data);
  });

  it('handles a closed path', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    appendPathLineTo(source, 100, 100);
    appendPathClose(source);
    const out = createPath();
    dashPath(source, [20, 10], 0, out);

    const moves = out.commands.filter((c) => c === PathCommand.MOVE_TO);
    expect(moves.length).toBeGreaterThanOrEqual(2);
  });

  it('applies dash offset correctly', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    const noOffset = createPath();
    dashPath(source, [10, 10], 0, noOffset);
    const withOffset = createPath();
    dashPath(source, [10, 10], 5, withOffset);

    // The first segment with offset=5 starts at x=0 but the on-phase is only 5 units.
    // So the data should differ.
    expect(withOffset.data).not.toStrictEqual(noOffset.data);
  });

  it('handles zero-length segments in the dash array', () => {
    const source = createPath();
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 50, 0);
    const out = createPath();
    // Zero gap means continuous — effectively all on.
    dashPath(source, [10, 0], 0, out);
    expect(out.commands.length).toBeGreaterThan(0);
  });

  it('preserves winding rule', () => {
    const source = createPath('evenOdd');
    appendPathMoveTo(source, 0, 0);
    appendPathLineTo(source, 100, 0);
    const out = createPath();
    dashPath(source, [10, 5], 0, out);
    expect(out.winding).toBe('evenOdd');
  });
});
