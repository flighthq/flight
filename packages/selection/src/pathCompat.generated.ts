// Generated from crates/flight-selection/src/path_compat.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

export function appendLassoClose(path: Path): void {
  appendPathClose(path);
}

export function appendLassoLineTo(path: Path, x: number, y: number): void {
  appendPathLineTo(path, x, y);
}

export function appendLassoMoveTo(path: Path, x: number, y: number): void {
  appendPathMoveTo(path, x, y);
}

export function createLassoPath(): Path {
  return createPath('evenOdd');
}

// [lenient] fn clear_lasso_path: portable `.clear()` receiver `path.commands` must be known to be `String`, `Vec`, slice, `HashMap`, or `HashSet`
