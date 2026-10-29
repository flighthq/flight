// Generated from crates/flight-clip/src/clip_region_strings.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { ClipRegionContoursReason, ClipRegionStatus } from './types.ts';

/**
 * The canonical TypeScript string for a contour validation reason.
 */
export function getClipRegionContoursReasonString(reason: ClipRegionContoursReason): string {
  return (() => {
    const matchValue = reason;
    switch (matchValue) {
      case ClipRegionContoursReason.OddCoordinateCount:
        return 'odd-coordinate-count';
      case ClipRegionContoursReason.TooFewPoints:
        return 'too-few-points';
    }
  })();
}

/**
 * The canonical TypeScript string for a region lifecycle status.
 */
export function getClipRegionStatusString(status: ClipRegionStatus): string {
  return (() => {
    const matchValue = status;
    switch (matchValue) {
      case ClipRegionStatus.Active:
        return 'active';
      case ClipRegionStatus.Released:
        return 'released';
    }
  })();
}

/**
 * Parses a TypeScript contour validation reason, returning None for vendor or misspelled names.
 */
export function parseClipRegionContoursReason(value: string): ClipRegionContoursReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'odd-coordinate-count':
        return ClipRegionContoursReason.OddCoordinateCount;
      case 'too-few-points':
        return ClipRegionContoursReason.TooFewPoints;
      default:
        return undefined;
    }
  })();
}

/**
 * Parses a TypeScript region lifecycle status, returning None for vendor or misspelled names.
 */
export function parseClipRegionStatus(value: string): ClipRegionStatus | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'active':
        return ClipRegionStatus.Active;
      case 'released':
        return ClipRegionStatus.Released;
      default:
        return undefined;
    }
  })();
}
