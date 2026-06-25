import type { PathSegment } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { forEachPathSegment } from './forEachPathSegment';
import {
  appendPathClose,
  appendPathCubicCurveTo,
  appendPathCurveTo,
  appendPathLineTo,
  appendPathMoveTo,
  createPath,
} from './path';

describe('forEachPathSegment', () => {
  it('visits nothing for an empty path', () => {
    const segments: PathSegment[] = [];
    forEachPathSegment(createPath(), (s) => segments.push(s));
    expect(segments).toStrictEqual([]);
  });
  it('yields moveTo and lineTo segments in order', () => {
    const path = createPath();
    appendPathMoveTo(path, 1, 2);
    appendPathLineTo(path, 3, 4);
    const segments: PathSegment[] = [];
    forEachPathSegment(path, (s) => segments.push(s));
    expect(segments).toStrictEqual([
      { kind: 'moveTo', x: 1, y: 2 },
      { kind: 'lineTo', x: 3, y: 4 },
    ]);
  });
  it('yields a curveTo segment with correct coordinates', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCurveTo(path, 10, 20, 30, 0);
    const segments: PathSegment[] = [];
    forEachPathSegment(path, (s) => segments.push(s));
    expect(segments[1]).toStrictEqual({ kind: 'curveTo', controlX: 10, controlY: 20, x: 30, y: 0 });
  });
  it('yields a cubicCurveTo segment with correct coordinates', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathCubicCurveTo(path, 10, 20, 30, 40, 50, 0);
    const segments: PathSegment[] = [];
    forEachPathSegment(path, (s) => segments.push(s));
    expect(segments[1]).toStrictEqual({
      kind: 'cubicCurveTo',
      control1X: 10,
      control1Y: 20,
      control2X: 30,
      control2Y: 40,
      x: 50,
      y: 0,
    });
  });
  it('yields a close segment', () => {
    const path = createPath();
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 10, 0);
    appendPathClose(path);
    const segments: PathSegment[] = [];
    forEachPathSegment(path, (s) => segments.push(s));
    expect(segments[2]).toStrictEqual({ kind: 'close' });
  });
  it('normalizes WIDE_MOVE_TO to moveTo', () => {
    const path = createPath();
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0, 0, 5, 6);
    const segments: PathSegment[] = [];
    forEachPathSegment(path, (s) => segments.push(s));
    expect(segments).toStrictEqual([{ kind: 'moveTo', x: 5, y: 6 }]);
  });
  it('normalizes WIDE_LINE_TO to lineTo', () => {
    const path = createPath();
    path.commands.push(PathCommand.WIDE_MOVE_TO);
    path.data.push(0, 0, 0, 0);
    path.commands.push(PathCommand.WIDE_LINE_TO);
    path.data.push(0, 0, 7, 8);
    const segments: PathSegment[] = [];
    forEachPathSegment(path, (s) => segments.push(s));
    expect(segments[1]).toStrictEqual({ kind: 'lineTo', x: 7, y: 8 });
  });
});
