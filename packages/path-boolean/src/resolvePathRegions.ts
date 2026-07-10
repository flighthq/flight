import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path, PathBooleanContour, PathWinding } from '@flighthq/types';

import { getPathBooleanBackend } from './pathBooleanBackend';

// Resolves a set of raw polygon rings into a single clean, valid filled-region `Path` by self-unioning
// them through the active boolean kernel under `fillRule`, then rebuilding the resolved contours with the
// path builders. This is the shared "raw rings → clean outline" primitive that both `offsetPath` (feeding
// the rings it strokes around each contour, always `nonZero`) and `simplifyPath` (feeding a path's own
// flattened contours under the caller's fill rule) compose over. The kernel dissolves self-overlap, merges
// touching rings, and traces holes counter-wound to their outer ring, so the rebuilt path is always
// `nonZero` regardless of the input fill rule. An empty ring set yields an empty path (no commands).
export function resolvePathRegions(rings: readonly PathBooleanContour[], fillRule: PathWinding): Path {
  const path = createPath('nonZero');
  if (rings.length === 0) return path;
  const resolved = getPathBooleanBackend().computePathBoolean(rings, EMPTY_CONTOURS, 'union', fillRule);
  for (const ring of resolved) {
    if (ring.length < 6) continue;
    appendPathMoveTo(path, ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) appendPathLineTo(path, ring[i], ring[i + 1]);
    appendPathClose(path);
  }
  return path;
}

const EMPTY_CONTOURS: readonly PathBooleanContour[] = [];
