import type {
  BinPackOptions,
  PackableRectangle,
  RectangleId,
  UnpackedRectangleExplanation,
  UnpackedRectangleReason,
} from '@flighthq/types/contract';

import { BIN_PACK_DEFAULT_MAX_EXTENT, packRectangles } from './packRectangles';

// Says WHY each unplaced rectangle did not fit. `packRectangles` reports `unpacked` as bare ids, which is
// the right shape for the hot path but tells a caller nothing about the remedy — and the three causes have
// three different ones: raise the cap, fix the border, or accept that the bin filled.
//
// Separately importable so the packer's own bundle pays nothing for it. It re-runs the pack rather than
// instrumenting it, which costs a second pass but keeps the packing loop free of reporting concerns and
// guarantees the explanation describes the same options the caller actually used.
//
// Returns an entry only for rectangles that failed; an all-placed input yields an empty array.
export function explainUnpackedRectangles(
  rectangles: readonly Readonly<PackableRectangle>[],
  options?: Readonly<BinPackOptions>,
): UnpackedRectangleExplanation[] {
  const border = options?.border ?? 0;
  const allowRotation = options?.allowRotation ?? false;
  const usableWidth = (options?.maxWidth ?? BIN_PACK_DEFAULT_MAX_EXTENT) - 2 * border;
  const usableHeight = (options?.maxHeight ?? BIN_PACK_DEFAULT_MAX_EXTENT) - 2 * border;

  const result = packRectangles(rectangles, options);
  if (result.unpacked.length === 0) return [];

  // `unpacked` is a MULTISET, not a set. packRectangles treats two rectangles sharing an id as distinct
  // pieces, so an id appears once per piece that failed — and matching on mere membership emitted an
  // entry for every rectangle carrying an unpacked id, which is two explanations for one failure when
  // only one of a duplicate pair fits. Consuming a count keeps the entry count equal to the failure
  // count, which is what the contract above promises.
  //
  // WHICH duplicate a given entry describes is input order, and that is the honest limit: the packer
  // sorts by area before placing and reports bare ids, so an id cannot identify a piece the packer
  // treats as distinct. The count is right; the attribution between same-id pieces is positional.
  const outstanding = new Map<RectangleId, number>();
  for (const id of result.unpacked) outstanding.set(id, (outstanding.get(id) ?? 0) + 1);
  const explanations: UnpackedRectangleExplanation[] = [];
  for (const rectangle of rectangles) {
    const remaining = outstanding.get(rectangle.id) ?? 0;
    if (remaining === 0) continue;
    outstanding.set(rectangle.id, remaining - 1);
    explanations.push({
      id: rectangle.id,
      reason: getUnpackedReason(rectangle, usableWidth, usableHeight, allowRotation),
      usableWidth,
      usableHeight,
    });
  }
  return explanations;
}

// Region collapse is checked before size, because when the usable region is non-positive EVERY rectangle
// fails for that one reason and reporting each as "oversized" would send the caller after the pieces
// instead of after the border.
function getUnpackedReason(
  rectangle: Readonly<PackableRectangle>,
  usableWidth: number,
  usableHeight: number,
  allowRotation: boolean,
): UnpackedRectangleReason {
  if (usableWidth <= 0 || usableHeight <= 0) return 'regionCollapsed';
  if (!fitsWithin(rectangle.width, rectangle.height, usableWidth, usableHeight)) {
    if (!allowRotation) return 'oversized';
    // Rotation is a real second chance, so a piece is only oversized when NEITHER orientation fits.
    if (!fitsWithin(rectangle.height, rectangle.width, usableWidth, usableHeight)) return 'oversized';
  }
  return 'binExhausted';
}

function fitsWithin(width: number, height: number, usableWidth: number, usableHeight: number): boolean {
  return width <= usableWidth && height <= usableHeight;
}
