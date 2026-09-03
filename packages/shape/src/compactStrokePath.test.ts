import type { Path } from '@flighthq/types/contract';
import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';

import { compactStrokePath } from './compactStrokePath';

describe('compactStrokePath', () => {
  it('converts an open centerline into a closed fill outline', () => {
    const centerline: Path = {
      [EntityRuntimeKey]: undefined,
      commands: [PathCommand.MOVE_TO, PathCommand.LINE_TO],
      data: [0, 0, 20, 0],
      winding: 'nonZero',
    };

    const outline = compactStrokePath(centerline, { cap: 'square', width: 4 });

    expect(outline.commands[0]).toBe(PathCommand.MOVE_TO);
    expect(outline.commands.at(-1)).toBe(PathCommand.CLOSE);
    expect(outline.data).toContain(-2);
    expect(outline.data).toContain(22);
  });

  it('returns an empty path for a centerline without a segment', () => {
    const centerline: Path = {
      [EntityRuntimeKey]: undefined,
      commands: [PathCommand.MOVE_TO],
      data: [0, 0],
      winding: 'nonZero',
    };

    expect(compactStrokePath(centerline, { width: 4 }).commands).toEqual([]);
  });
});
