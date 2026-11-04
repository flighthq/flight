// Generated from crates/flight-binpack/src/explain_unpacked_rectangles.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { BinPackOptions, PackableRectangle, RectangleId } from './packRectangles.ts';
import { BIN_PACK_DEFAULT_MAX_EXTENT, packRectangles } from './packRectangles.ts';

/**
 * The reason a rectangle could not be placed.
 */
export type UnpackedRectangleReason = 'oversized' | 'regionCollapsed' | 'binExhausted';

/**
 * An explanation of why a single rectangle was not placed.
 */
export interface UnpackedRectangleExplanation {
  readonly id: RectangleId;
  readonly reason: UnpackedRectangleReason;
  readonly usableWidth: number;
  readonly usableHeight: number;
}

/**
 * Says WHY each unplaced rectangle did not fit. `packRectangles` reports `unpacked` as bare ids,
 * which is the right shape for the hot path but tells a caller nothing about the remedy -- and the
 * three causes have three different ones: raise the cap, fix the border, or accept that the bin
 * filled.
 *
 * Separately importable so the packer's own bundle pays nothing for it. It re-runs the pack
 * rather than instrumenting it, which costs a second pass but keeps the packing loop free of
 * reporting concerns and guarantees the explanation describes the same options the caller actually
 * used.
 *
 * Returns an entry only for rectangles that failed; an all-placed input yields an empty vector.
 */
export function explainUnpackedRectangles(
  out: UnpackedRectangleExplanation[],
  rectangles: Readonly<PackableRectangle[]>,
  options?: Readonly<BinPackOptions>,
): void {
  out.length = 0;
  const border = options?.border ?? 0.0;
  const allowRotation = options?.allowRotation ?? false;
  const usableWidth = (options?.maxWidth ?? BIN_PACK_DEFAULT_MAX_EXTENT) - 2.0 * border;
  const usableHeight = (options?.maxHeight ?? BIN_PACK_DEFAULT_MAX_EXTENT) - 2.0 * border;
  const result = packRectangles(rectangles, options);
  if (result.unpacked.length === 0) {
    return;
  }
  let explained: RectangleId[] = [] as never[];
  for (const rectangle of rectangles) {
    let outstandingCount = 0;
    for (const id of result.unpacked) {
      if (id === rectangle.id) {
        outstandingCount += 1;
      }
    }
    let explainedCount = 0;
    for (const id of explained) {
      if (id === rectangle.id) {
        explainedCount += 1;
      }
    }
    if (explainedCount >= outstandingCount) {
      continue;
    }
    explained.push(rectangle.id);
    out.push({
      id: rectangle.id,
      reason: getUnpackedReason(rectangle, usableWidth, usableHeight, allowRotation),
      usableWidth: usableWidth,
      usableHeight: usableHeight,
    });
  }
}

function fitsWithin(width: number, height: number, usableWidth: number, usableHeight: number): boolean {
  return width <= usableWidth && height <= usableHeight;
}

/**
 * Region collapse is checked before size, because when the usable region is non-positive EVERY
 * rectangle fails for that one reason and reporting each as "oversized" would send the caller
 * after the pieces instead of after the border.
 */
function getUnpackedReason(
  rectangle: Readonly<PackableRectangle>,
  usableWidth: number,
  usableHeight: number,
  allowRotation: boolean,
): UnpackedRectangleReason {
  if (usableWidth <= 0.0 || usableHeight <= 0.0) {
    return 'regionCollapsed';
  }
  if (!fitsWithin(rectangle.width, rectangle.height, usableWidth, usableHeight)) {
    if (!allowRotation) {
      return 'oversized';
    }
    if (!fitsWithin(rectangle.height, rectangle.width, usableWidth, usableHeight)) {
      return 'oversized';
    }
  }
  return 'binExhausted';
}

export function getUnpackedRectangleReasonString(value: UnpackedRectangleReason): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'oversized':
        return 'oversized';
      case 'regionCollapsed':
        return 'regionCollapsed';
      case 'binExhausted':
        return 'binExhausted';
    }
  })();
}

export function parseUnpackedRectangleReason(value: string): UnpackedRectangleReason | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'oversized':
        return 'oversized';
      case 'regionCollapsed':
        return 'regionCollapsed';
      case 'binExhausted':
        return 'binExhausted';
      default:
        return undefined;
    }
  })();
}
