// Generated from crates/flight-path/src/for_each_path_segment.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathRaw, PathSegment } from './path.ts';
import { PathCommand } from './path.ts';

/**
 * Decodes every segment in `path` and passes each to `visitor` in order. WIDE_MOVE_TO and WIDE_LINE_TO are
 * normalized to their moveTo and lineTo equivalents (the dummy coordinate pair is dropped).
 * NO_OP verbs are skipped silently.
 */
export function forEachPathSegment(path: Readonly<PathRaw>, visitor: (arg0: PathSegment) => void): void {
  const commands = path.commands;
  const data = path.data;
  let di: number = 0;
  for (let ci = 0; ci < commands.length; ci += 1) {
    const command = commands[ci];
    if (command === PathCommand.MOVE_TO) {
      const x = data[di];
      const y = data[di + 1];
      di += 2;
      visitor({ kind: 'moveTo' as const, x: x, y: y });
    } else {
      if (command === PathCommand.WIDE_MOVE_TO) {
        const x = data[di + 2];
        const y = data[di + 3];
        di += 4;
        visitor({ kind: 'moveTo' as const, x: x, y: y });
      } else {
        if (command === PathCommand.LINE_TO) {
          const x = data[di];
          const y = data[di + 1];
          di += 2;
          visitor({ kind: 'lineTo' as const, x: x, y: y });
        } else {
          if (command === PathCommand.WIDE_LINE_TO) {
            const x = data[di + 2];
            const y = data[di + 3];
            di += 4;
            visitor({ kind: 'lineTo' as const, x: x, y: y });
          } else {
            if (command === PathCommand.QUADRATIC_CURVE_TO) {
              const controlX = data[di];
              const controlY = data[di + 1];
              const x = data[di + 2];
              const y = data[di + 3];
              di += 4;
              visitor({ kind: 'quadraticCurveTo' as const, controlX: controlX, controlY: controlY, x: x, y: y });
            } else {
              if (command === PathCommand.CUBIC_CURVE_TO) {
                const controlX1 = data[di];
                const controlY1 = data[di + 1];
                const controlX2 = data[di + 2];
                const controlY2 = data[di + 3];
                const x = data[di + 4];
                const y = data[di + 5];
                di += 6;
                visitor({
                  kind: 'cubicCurveTo' as const,
                  controlX1: controlX1,
                  controlY1: controlY1,
                  controlX2: controlX2,
                  controlY2: controlY2,
                  x: x,
                  y: y,
                });
              } else {
                if (command === PathCommand.CLOSE) {
                  visitor({ kind: 'close' as const });
                }
              }
            }
          }
        }
      }
    }
  }
}
