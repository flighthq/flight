// Generated from crates/flight-path/src/path_morph.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { PathMorphRaw, PathRaw } from './path.ts';
import { buildPathMorph } from './pathMorphGeometry.ts';

/**
 * Allocates a prepared interpolation between two paths. Returns `undefined` when the paths
 * are incompatible (different winding, contour count, closedness, or orientation).
 */
export function createPathMorph(start: Readonly<PathRaw>, end: Readonly<PathRaw>): PathMorphRaw | null {
  const result = buildPathMorph(start, end);
  return result.morph ?? null;
}

/**
 * Samples a prepared morph into `out`. Progress is not clamped: 0 and 1 are the endpoints,
 * while values outside that range permit deliberate easing overshoot.
 */
export function samplePathMorph(out: PathRaw, morph: Readonly<PathMorphRaw>, progress: number): void {
  const commands = morph.commands;
  out.commands.length = 0;
  for (let i = 0; i < commands.length; i += 1) {
    out.commands.push(commands[i]);
  }
  const startData = morph.startData;
  const endData = morph.endData;
  out.data.length = 0;
  for (let _ = 0; _ < startData.length; _ += 1) {
    out.data.push(0.0);
  }
  if (progress === 0.0 || progress === 1.0) {
    const endpoint = progress === 0.0 ? startData : endData;
    for (let i = 0; i < endpoint.length; i += 1) {
      out.data[i] = endpoint[i];
    }
    out.winding = morph.winding;
    return;
  }
  for (let i = 0; i < startData.length; i += 1) {
    const s = startData[i];
    const e = endData[i];
    out.data[i] = s + (e - s) * progress;
  }
  out.winding = morph.winding;
}
