// Generated from crates/flight-path-boolean/src/write_path_boolean_contours.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathClose, appendPathLineTo, appendPathMoveTo } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

/**
 * Converts a set of polygon contour rings (flat interleaved `[x, y, ...]` coordinate
 * arrays) into a `Path` of MoveTo/LineTo/Close commands. Each ring with at least three
 * vertices becomes one closed sub-path in the output. The output path's winding is
 * always set to `NonZero`.
 */
export function writePathBooleanContours(out: Path, contours: Readonly<number[][]>): void {
  out.commands = [] as never[];
  out.data = [] as never[];
  out.winding = 'nonZero';
  for (const ring of contours) {
    if (ring.length < 6) {
      continue;
    }
    appendPathMoveTo(out, ring[0], ring[1]);
    let i = 2;
    while (i < ring.length) {
      appendPathLineTo(out, ring[i], ring[i + 1]);
      i += 2;
    }
    appendPathClose(out);
  }
}
