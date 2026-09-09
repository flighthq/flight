import type { Path, PathBooleanContour, PathBooleanFillRule } from '@flighthq/types/contract';

import { getPathBooleanBackend } from './pathBooleanBackend';
import { writePathBooleanContours } from './writePathBooleanContours';

// Resolves a set of raw polygon rings into a single clean, valid filled-region `Path` by self-unioning
// them through the active boolean kernel under `fillRule`, then rebuilding the resolved contours with the
// path builders. This is the shared "raw rings → clean outline" primitive that both `offsetPath` (feeding
// the rings it strokes around each contour, always `nonZero`) and `simplifyPath` (feeding a path's own
// flattened contours under the caller's fill rule) compose over. The kernel dissolves self-overlap, merges
// touching rings, and traces holes counter-wound to their outer ring, so the rebuilt path is always
// `nonZero` regardless of the input fill rule. `fillRule` is the kernel-level `PathBooleanFillRule`
// superset: `simplifyPath` passes the caller's `evenOdd`/`nonZero`, while `offsetPath` passes `positive`
// for its offset-cleanup fill. An empty ring set yields an empty path (no commands).
export function resolvePathRegions(
  rings: readonly PathBooleanContour[],
  fillRule: PathBooleanFillRule,
  out?: Path,
): Path {
  if (rings.length === 0) return writePathBooleanContours(EMPTY_CONTOURS, out);
  const resolved = getPathBooleanBackend().computePathBoolean(rings, EMPTY_CONTOURS, 'union', fillRule);
  return writePathBooleanContours(resolved, out);
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
