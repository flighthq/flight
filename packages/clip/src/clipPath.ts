// Generated from crates/flight-clip/src/clip_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

export function flattenClipPath(out: number[][], path: Readonly<Path>, tolerance?: number): void {
  out.length = 0;
  for (const contour of flattenPath(path, tolerance)) {
    out.push(contour);
  }
}
