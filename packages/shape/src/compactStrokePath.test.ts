import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { PathCommand } from '@flighthq/types/contract';

import { compactStrokePath } from './compactStrokePath.ts';

describe('compactStrokePath', () => {
  it('converts an open centerline into a closed fill outline', () => {
    const centerline = createPath('nonZero');
    appendPathMoveTo(centerline, 0, 0);
    appendPathLineTo(centerline, 20, 0);

    const outline = compactStrokePath(centerline, { cap: 'square', width: 4 });

    expect(outline.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(outline.commands.at(-1)).toBe(PathCommand.CLOSE);
    expect(outline.data).toContain(-2);
    expect(outline.data).toContain(22);
  });

  it('returns an empty path for a centerline without a segment', () => {
    const centerline = createPath('nonZero');
    appendPathMoveTo(centerline, 0, 0);

    expect(compactStrokePath(centerline, { width: 4 }).commands).toEqual([]);
  });
});
