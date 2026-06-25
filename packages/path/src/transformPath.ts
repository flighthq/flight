import type { MatrixLike, Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { copyPath } from './copyPath';

// Applies a 2D affine matrix to all anchor and control-point coordinate pairs in `source`, writing
// the result into `out`. `out` may be the same object as `source` (alias-safe: inputs are read into
// locals before writing). Commands and winding are copied unchanged.
//
// Matrix layout: [a c tx]   x' = a*x + c*y + tx
//                [b d ty]   y' = b*x + d*y + ty
export function transformPath(source: Readonly<Path>, matrix: Readonly<MatrixLike>, out: Path): void {
  const { a, b, c, d, tx, ty } = matrix;
  // Copy commands and winding first (handles the alias case for the data array below).
  copyPath(source, out);
  const data = out.data;
  const commands = source.commands;
  let di = 0;
  for (let ci = 0; ci < commands.length; ci++) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO || command === PathCommand.LINE_TO) {
      // 2 values: x, y
      const x = data[di];
      const y = data[di + 1];
      data[di] = a * x + c * y + tx;
      data[di + 1] = b * x + d * y + ty;
      di += 2;
    } else if (command === PathCommand.CURVE_TO) {
      // 4 values: controlX, controlY, anchorX, anchorY
      for (let k = 0; k < 4; k += 2) {
        const x = data[di + k];
        const y = data[di + k + 1];
        data[di + k] = a * x + c * y + tx;
        data[di + k + 1] = b * x + d * y + ty;
      }
      di += 4;
    } else if (command === PathCommand.CUBIC_CURVE_TO) {
      // 6 values: control1X, control1Y, control2X, control2Y, anchorX, anchorY
      for (let k = 0; k < 6; k += 2) {
        const x = data[di + k];
        const y = data[di + k + 1];
        data[di + k] = a * x + c * y + tx;
        data[di + k + 1] = b * x + d * y + ty;
      }
      di += 6;
    } else if (command === PathCommand.WIDE_MOVE_TO || command === PathCommand.WIDE_LINE_TO) {
      // 4 values: dummy pair + real x, y. Only the real pair at [di+2, di+3] is transformed.
      const x = data[di + 2];
      const y = data[di + 3];
      data[di + 2] = a * x + c * y + tx;
      data[di + 3] = b * x + d * y + ty;
      di += 4;
    }
    // CLOSE, NO_OP, and unrecognized verbs consume no data.
  }
}

// Translates all points in `source` by (dx, dy), writing the result into `out`. Alias-safe.
// This is a convenience wrapper around `transformPath` for the common pure-translate case.
export function translatePath(source: Readonly<Path>, dx: number, dy: number, out: Path): void {
  transformPath(source, { a: 1, b: 0, c: 0, d: 1, tx: dx, ty: dy }, out);
}
