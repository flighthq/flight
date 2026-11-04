// Generated from crates/flight-path/src/transform_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { MatrixLike } from '@flighthq/geometry/contract';

import { copyPath } from './copyPath.ts';
import { PathCommand } from './path.ts';
import type { Path } from './pathCompat.ts';

/**
 * Applies a 2D affine matrix to all anchor and control-point coordinate pairs in `source`,
 * writing the result into `out`. Alias-safe. Commands and winding are copied unchanged.
 */
export function transformPath(source: Readonly<Path>, matrix: Readonly<MatrixLike>, out: Path): void {
  transformPathCoordinates(source, matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty, out);
}

function transformPathCoordinates(
  source: Readonly<Path>,
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
  out: Path,
): void {
  copyPath(out, source);
  const commands = out.commands.slice();
  const data = out.data;
  let di: number = 0;
  for (let ci = 0; ci < commands.length; ci += 1) {
    const command = commands[ci];
    if (command === (PathCommand.MOVE_TO & 0xff) || command === (PathCommand.LINE_TO & 0xff)) {
      const x = data[di];
      const y = data[di + 1];
      data[di] = a * x + c * y + tx;
      data[di + 1] = b * x + d * y + ty;
      di += 2;
    } else {
      if (command === (PathCommand.QUADRATIC_CURVE_TO & 0xff)) {
        for (let pair = 0; pair < 2; pair += 1) {
          const k = pair * 2;
          const x = data[di + k];
          const y = data[di + k + 1];
          data[di + k] = a * x + c * y + tx;
          data[di + k + 1] = b * x + d * y + ty;
        }
        di += 4;
      } else {
        if (command === (PathCommand.CUBIC_CURVE_TO & 0xff)) {
          for (let pair = 0; pair < 3; pair += 1) {
            const k = pair * 2;
            const x = data[di + k];
            const y = data[di + k + 1];
            data[di + k] = a * x + c * y + tx;
            data[di + k + 1] = b * x + d * y + ty;
          }
          di += 6;
        } else {
          if (command === (PathCommand.WIDE_MOVE_TO & 0xff) || command === (PathCommand.WIDE_LINE_TO & 0xff)) {
            const x = data[di + 2];
            const y = data[di + 3];
            data[di + 2] = a * x + c * y + tx;
            data[di + 3] = b * x + d * y + ty;
            di += 4;
          }
        }
      }
    }
  }
}

/**
 * Translates all points in `source` by (dx, dy). Alias-safe.
 */
export function translatePath(source: Readonly<Path>, dx: number, dy: number, out: Path): void {
  transformPathCoordinates(source, 1.0, 0.0, 0.0, 1.0, dx, dy, out);
}
