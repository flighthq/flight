// Generated from crates/flight-motionpath/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRaw } from '@flighthq/entity/contract';
import type { Path } from '@flighthq/path/contract';

/**
 * How the marker behaves when it reaches an end of the path (TS `MotionPathLoopMode`), a closed
 * string union. `Clamp` stops at the ends; `Loop` wraps modulo the path length; `Pingpong`
 * reflects at each end and reverses `direction`.
 */
export type MotionPathLoopMode = 'clamp' | 'loop' | 'pingpong';

/**
 * The marker's travel direction (TS `1 | -1`), a closed representation. `Forward` traverses from
 * the path start; `Backward` travels toward it. Direction is stored rather than folded into a
 * signed speed because `Pingpong` must remember which way the marker is heading across frames.
 * The discriminants are the source's numeric values, so `direction as i8 as f64` is the signed
 * travel factor.
 */
export type MotionPathDirection = 1 | -1;

/**
 * A marker's arc-length position and traversal state along a `Path` (TS `MotionPath`, an Entity).
 * `distance` is kept in `[0, length]`; `length` is the path's total arc length cached once at
 * creation. `speed` is a magnitude — the travel sign lives in `direction`. The `path` handle is the
 * source's retained object reference.
 */
export interface MotionPathRaw extends EntityRaw {
  direction: MotionPathDirection;
  distance: number;
  length: number;
  loopMode: MotionPathLoopMode;
  path: Path;
  speed: number;
}

export function getMotionPathLoopModeString(value: MotionPathLoopMode): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'clamp':
        return 'clamp';
      case 'loop':
        return 'loop';
      case 'pingpong':
        return 'pingpong';
    }
  })();
}

export function parseMotionPathLoopMode(value: string): MotionPathLoopMode | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'clamp':
        return 'clamp';
      case 'loop':
        return 'loop';
      case 'pingpong':
        return 'pingpong';
      default:
        return undefined;
    }
  })();
}
