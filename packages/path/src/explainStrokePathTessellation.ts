// Generated from crates/flight-path/src/explain_stroke_path_tessellation.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathRaw, StrokePathTessellationExplanation, StrokeStyle } from './path.ts';
import { buildStrokePathGeometry } from './strokePathGeometry.ts';

/**
 * Pure diagnostic twin of tessellate_stroke_path. Re-runs the shared validation, retains
 * and mutates nothing, and returns detached plain data explaining a null mesh.
 */
export function explainStrokePathTessellation(
  path: Readonly<PathRaw>,
  style: Readonly<StrokeStyle>,
  tolerance?: number,
): StrokePathTessellationExplanation {
  tolerance = tolerance ?? 0.25;
  const geometry = buildStrokePathGeometry(path, style, tolerance);
  return { supported: geometry.issue === 'ok', reason: geometry.issue, subpath: geometry.issueSubpath ?? null };
}
