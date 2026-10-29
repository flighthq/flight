// Generated from crates/flight-path-boolean/src/resolve_path_regions.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Path } from '@flighthq/path/contract';

import type { PathBooleanFillRule, PathBooleanKernelRaw } from './martinezKernel.ts';
import { writePathBooleanContours } from './writePathBooleanContours.ts';

/**
 * Resolves a set of polygon contour rings under the given fill rule by self-unioning
 * them through the boolean kernel. The result is a clean, hole-correct polygon outline
 * written into `out`.
 */
export function resolvePathRegions(
  out: Path,
  pathBooleanKernel: Readonly<PathBooleanKernelRaw>,
  rings: Readonly<number[][]>,
  fillRule: PathBooleanFillRule,
): void {
  if (rings.length === 0) {
    const empty: number[][] = [] as never[];
    writePathBooleanContours(out, empty);
    return;
  }
  const empty: number[][] = [] as never[];
  const resolved = pathBooleanKernel.computePathBoolean(rings, empty, 'union', fillRule);
  writePathBooleanContours(out, resolved);
}
