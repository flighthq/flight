import type { Path, PathSegment } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

// Iterates over all segments in `path`, calling `visitor` once for each decoded segment. Each call
// receives a `PathSegment` value describing the verb and its coordinates. The visitor receives
// segments in command-stream order; WIDE_MOVE_TO and WIDE_LINE_TO are normalized to their moveTo
// and lineTo equivalents (the dummy coordinate pair is dropped). NO_OP verbs are skipped silently.
//
// This is the canonical way for consumers to walk path segments without re-implementing the
// commands/data stride decode that flattenPath does internally.
export function forEachPathSegment(path: Readonly<Path>, visitor: (segment: PathSegment) => void): void {
  const commands = path.commands;
  const data = path.data;
  let di = 0;
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      const x = data[di];
      const y = data[di + 1];
      di += 2;
      visitor({ kind: 'moveTo', x, y });
    } else if (command === PathCommand.WIDE_MOVE_TO) {
      // Normalize to moveTo; the dummy pair at [di, di+1] is discarded.
      const x = data[di + 2];
      const y = data[di + 3];
      di += 4;
      visitor({ kind: 'moveTo', x, y });
    } else if (command === PathCommand.LINE_TO) {
      const x = data[di];
      const y = data[di + 1];
      di += 2;
      visitor({ kind: 'lineTo', x, y });
    } else if (command === PathCommand.WIDE_LINE_TO) {
      // Normalize to lineTo; the dummy pair at [di, di+1] is discarded.
      const x = data[di + 2];
      const y = data[di + 3];
      di += 4;
      visitor({ kind: 'lineTo', x, y });
    } else if (command === PathCommand.CURVE_TO) {
      const controlX = data[di];
      const controlY = data[di + 1];
      const x = data[di + 2];
      const y = data[di + 3];
      di += 4;
      visitor({ kind: 'curveTo', controlX, controlY, x, y });
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      const control1X = data[di];
      const control1Y = data[di + 1];
      const control2X = data[di + 2];
      const control2Y = data[di + 3];
      const x = data[di + 4];
      const y = data[di + 5];
      di += 6;
      visitor({ kind: 'cubicCurveTo', control1X, control1Y, control2X, control2Y, x, y });
    } else if (command === PathCommand.CLOSE) {
      visitor({ kind: 'close' });
      // CLOSE consumes 0 data values.
    }
    // NO_OP and unrecognized verbs consume no data and are skipped.
  }
}
