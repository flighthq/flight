// Generated from crates/flight-clip/src/clip_region_strings.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { ClipRegionContoursReason, ClipRegionStatus } from './types.ts';

/**
 * The canonical TypeScript string for a contour validation reason.
 */
export function getClipRegionContoursReasonString(reason: ClipRegionContoursReason): string {
  return (() => {
    const matchValue = reason;
    switch (matchValue) {
      case 'odd-coordinate-count':
        return 'odd-coordinate-count';
      case 'too-few-points':
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
      case 'active':
        return 'active';
      case 'released':
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
        return 'odd-coordinate-count';
      case 'too-few-points':
        return 'too-few-points';
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
        return 'active';
      case 'released':
        return 'released';
      default:
        return undefined;
    }
  })();
}
