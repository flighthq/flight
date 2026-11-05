// Generated from crates/flight-path/src/path_morph.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Path, PathMorph } from './pathCompat.ts';
import { allocatePathMorph, preparePathMorph } from './pathMorphGeometry.ts';

/**
 * Allocates a prepared interpolation between two paths. Returns `undefined` when the paths
 * are incompatible (different winding, contour count, closedness, or orientation).
 */
export function createPathMorph(start: Readonly<Path>, end: Readonly<Path>): PathMorph | null {
  const preparation = preparePathMorph(start, end);
  if (preparation.issue !== 'ok') {
    return null;
  }
  return allocatePathMorph(preparation, start.winding);
}

/**
 * Samples a prepared morph into `out`. Progress is not clamped: 0 and 1 are the endpoints,
 * while values outside that range permit deliberate easing overshoot.
 */
export function samplePathMorph(out: Path, morph: Readonly<PathMorph>, progress: number): void {
  const commands = morph.commands;
  const outCommands: number[] = out.commands;
  outCommands.length = 0;
  for (let i = 0; i < commands.length; i++) {
    out.commands.push(commands[i]);
  }
  const startData = morph.startData;
  const endData = morph.endData;
  const outData: number[] = out.data;
  outData.length = 0;
  for (let _ = 0; _ < startData.length; _++) {
    out.data.push(0);
  }
  if (progress === 0 || progress === 1) {
    const endpoint = progress === 0 ? startData : endData;
    for (let i = 0; i < endpoint.length; i++) {
      out.data[i] = endpoint[i];
    }
    out.winding = morph.winding;
    return;
  }
  for (let i = 0; i < startData.length; i++) {
    const s = startData[i];
    const e = endData[i];
    out.data[i] = s + (e - s) * progress;
  }
  out.winding = morph.winding;
}
