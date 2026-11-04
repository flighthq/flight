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
  const tolerance_1 = tolerance ?? 0.25;
  const geometry = buildStrokePathGeometry(path, style, tolerance_1);
  return { supported: geometry.issue === 'ok', reason: geometry.issue, subpath: geometry.issueSubpath ?? null };
}
