import { intersectsRectangle } from '@flighthq/geometry';
import type { BinPackOptions, PackableRectangle, PackedRectangle, PackResult, RectangleId } from '@flighthq/types';

// Places a set of rectangles without overlap into a bin using the MaxRects algorithm with the
// Best-Short-Side-Fit (BSSF) heuristic, and reports each placement, the used bin extent, and any ids
// that did not fit.
//
// The result is deterministic: the same `rects` (by value) and `options` always produce an identical
// `PackResult`. Inputs are sorted by descending area, then descending height, then width, then id
// before placement — a total order with no reliance on sort stability — and no `Math.random`/`Date`
// is consulted.
//
// Padding and border are honored geometrically: every pair of placements is at least `padding` apart
// and every placement is at least `border` from the reported bin edge. When `allowRotation` is set, a
// rectangle may be turned 90° (reported via `rotated` and swapped `width`/`height`) if that fits
// better. A `growable` bin starts small and grows toward `maxWidth`/`maxHeight`; a fixed bin overflows
// into `unpacked`. The reported `width`/`height` is the tight used extent, then adjusted for `square`
// and `powerOfTwo` when those are set.
export function packRectangles(
  rects: readonly Readonly<PackableRectangle>[],
  options?: Readonly<BinPackOptions>,
): PackResult {
  const padding = options?.padding ?? 0;
  const border = options?.border ?? 0;
  const allowRotation = options?.allowRotation ?? false;
  const growable = options?.growable ?? true;
  const powerOfTwo = options?.powerOfTwo ?? false;
  const square = options?.square ?? false;
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_EXTENT;
  const maxHeight = options?.maxHeight ?? DEFAULT_MAX_EXTENT;

  if (rects.length === 0) {
    return {
      placements: [],
      width: finalizeExtent(0, powerOfTwo),
      height: finalizeExtent(0, powerOfTwo),
      unpacked: [],
    };
  }

  const sorted = sortRectanglesForPacking(rects);

  // The smallest bin each dimension must reach for a rectangle to fit at all, accounting for the
  // border on both sides. A rectangle wider than `maxWidth` (and, if rotatable, taller than
  // `maxHeight` in its other orientation) can never be placed and lands in `unpacked`.
  let needWidth = 2 * border;
  let needHeight = 2 * border;
  let totalArea = 0;
  for (const rect of sorted) {
    const shortSide = Math.min(rect.width, rect.height);
    const requiredWidth = (allowRotation ? shortSide : rect.width) + 2 * border;
    const requiredHeight = (allowRotation ? shortSide : rect.height) + 2 * border;
    needWidth = Math.max(needWidth, requiredWidth);
    needHeight = Math.max(needHeight, requiredHeight);
    totalArea += (rect.width + padding) * (rect.height + padding);
  }

  // A fixed bin is exactly the cap; a growable bin starts at a square seed sized to the total area (but
  // at least large enough to hold the largest single rectangle) and grows from there.
  const seed = Math.ceil(Math.sqrt(totalArea)) + 2 * border;
  let binWidth = growable ? Math.min(Math.max(seed, needWidth), maxWidth) : maxWidth;
  let binHeight = growable ? Math.min(Math.max(seed, needHeight), maxHeight) : maxHeight;

  let attempt = packIntoBin(sorted, binWidth, binHeight, padding, border, allowRotation);
  while (attempt.unpacked.length > 0 && growable && (binWidth < maxWidth || binHeight < maxHeight)) {
    if (binWidth <= binHeight && binWidth < maxWidth) {
      binWidth = Math.min(binWidth * 2, maxWidth);
    } else if (binHeight < maxHeight) {
      binHeight = Math.min(binHeight * 2, maxHeight);
    } else {
      binWidth = Math.min(binWidth * 2, maxWidth);
    }
    attempt = packIntoBin(sorted, binWidth, binHeight, padding, border, allowRotation);
  }

  return finalizeResult(attempt, border, powerOfTwo, square);
}

// A free rectangle of unoccupied bin space, in the packer's internal "effective" coordinate space
// (see `packIntoBin`). Mutated in place as free space is split and pruned.
interface FreeRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The chosen placement for one rectangle: its top-left corner in effective space, the effective
// footprint size occupied (rectangle size plus the trailing padding gutter), and whether it was
// rotated 90°.
interface Placement {
  x: number;
  y: number;
  footprintWidth: number;
  footprintHeight: number;
  rotated: boolean;
}

// Rounds `value` up to the next power of two (>= 1). Used only for the final `powerOfTwo` adjustment.
function ceilToPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

// Turns the raw placements from `packIntoBin` into the public `PackResult`, shifting effective-space
// coordinates back into bin space by `border` and finalizing the reported extent for `square` /
// `powerOfTwo`.
function finalizeResult(
  packed: Readonly<{ placements: readonly PackedRectangle[]; unpacked: readonly RectangleId[] }>,
  border: number,
  powerOfTwo: boolean,
  square: boolean,
): PackResult {
  let contentRight = 0;
  let contentBottom = 0;
  for (const placement of packed.placements) {
    contentRight = Math.max(contentRight, placement.x + placement.width);
    contentBottom = Math.max(contentBottom, placement.y + placement.height);
  }

  let width = packed.placements.length > 0 ? contentRight + border : 0;
  let height = packed.placements.length > 0 ? contentBottom + border : 0;

  if (square) {
    width = Math.max(width, height);
    height = width;
  }
  width = finalizeExtent(width, powerOfTwo);
  height = finalizeExtent(height, powerOfTwo);
  if (square) {
    width = Math.max(width, height);
    height = width;
  }

  return {
    placements: packed.placements.map((placement) => ({ ...placement })),
    width,
    height,
    unpacked: [...packed.unpacked],
  };
}

// Applies the `powerOfTwo` rounding (if set) to a single extent value.
function finalizeExtent(value: number, powerOfTwo: boolean): number {
  return powerOfTwo && value > 0 ? ceilToPowerOfTwo(value) : value;
}

// Best-Short-Side-Fit search: over every free rectangle (and, when rotation is allowed, both
// orientations of the piece), pick the fit that leaves the smallest leftover short side, breaking
// ties by smallest leftover long side, then by top-most / left-most free rectangle, then by the
// unrotated orientation. Returns the chosen placement, or `null` when the piece fits nowhere.
//
// `pieceWidth`/`pieceHeight` are the effective footprint (rectangle size plus the trailing padding
// gutter) in the unrotated orientation.
function findBestPlacement(
  free: readonly Readonly<FreeRectangle>[],
  pieceWidth: number,
  pieceHeight: number,
  allowRotation: boolean,
): Placement | null {
  let best: Placement | null = null;
  let bestShort = Number.POSITIVE_INFINITY;
  let bestLong = Number.POSITIVE_INFINITY;

  for (const node of free) {
    // Two candidate orientations: unrotated, then (optionally) the 90° turn.
    for (let rotated = 0; rotated <= (allowRotation ? 1 : 0); rotated++) {
      const width = rotated ? pieceHeight : pieceWidth;
      const height = rotated ? pieceWidth : pieceHeight;
      if (width > node.width || height > node.height) continue;

      const leftoverHorizontal = node.width - width;
      const leftoverVertical = node.height - height;
      const shortSide = Math.min(leftoverHorizontal, leftoverVertical);
      const longSide = Math.max(leftoverHorizontal, leftoverVertical);

      if (best === null || shortSide < bestShort || (shortSide === bestShort && longSide < bestLong)) {
        best = { x: node.x, y: node.y, footprintWidth: width, footprintHeight: height, rotated: rotated === 1 };
        bestShort = shortSide;
        bestLong = longSide;
      }
    }
  }

  return best;
}

// True when the whole of `inner` lies within `outer` — the containment test used to prune redundant
// free rectangles after a split.
function isFreeRectangleContained(inner: Readonly<FreeRectangle>, outer: Readonly<FreeRectangle>): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

// Runs one MaxRects pass at a fixed bin size. Every rectangle is inflated to an "effective" footprint
// of `(width + padding) x (height + padding)` — the trailing gutter is what guarantees at least
// `padding` between neighbors — and packed into the effective usable region
// `(binWidth - 2*border + padding) x (binHeight - 2*border + padding)`. This construction makes the
// actual placement satisfy `x >= border` and `x + width <= binWidth - border` (likewise vertically),
// so `border` is respected on every side while the last row/column's gutter costs no real space.
function packIntoBin(
  sorted: readonly Readonly<PackableRectangle>[],
  binWidth: number,
  binHeight: number,
  padding: number,
  border: number,
  allowRotation: boolean,
): { placements: PackedRectangle[]; unpacked: RectangleId[] } {
  const usableWidth = binWidth - 2 * border + padding;
  const usableHeight = binHeight - 2 * border + padding;

  const placements: PackedRectangle[] = [];
  const unpacked: RectangleId[] = [];

  if (usableWidth <= 0 || usableHeight <= 0) {
    for (const rect of sorted) unpacked.push(rect.id);
    return { placements, unpacked };
  }

  const free: FreeRectangle[] = [{ x: 0, y: 0, width: usableWidth, height: usableHeight }];

  for (const rect of sorted) {
    const pieceWidth = rect.width + padding;
    const pieceHeight = rect.height + padding;
    const placement = findBestPlacement(free, pieceWidth, pieceHeight, allowRotation);
    if (placement === null) {
      unpacked.push(rect.id);
      continue;
    }

    placements.push({
      id: rect.id,
      x: placement.x + border,
      y: placement.y + border,
      width: placement.rotated ? rect.height : rect.width,
      height: placement.rotated ? rect.width : rect.height,
      rotated: placement.rotated,
    });

    splitFreeRectangles(free, placement);
    pruneFreeRectangles(free);
  }

  return { placements, unpacked };
}

// Removes any free rectangle fully contained within another. MaxRects splitting can leave redundant
// free rectangles nested inside larger ones; pruning them keeps the search cheap and the free list
// non-redundant.
function pruneFreeRectangles(free: FreeRectangle[]): void {
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (isFreeRectangleContained(free[i], free[j])) {
        free.splice(i, 1);
        i--;
        break;
      }
      if (isFreeRectangleContained(free[j], free[i])) {
        free.splice(j, 1);
        j--;
      }
    }
  }
}

// Deterministic total order over the input rectangles: descending area, then descending height, then
// descending width, then ascending id (numbers before strings; numbers numerically, strings
// lexicographically). Returns a new array; the input is not mutated.
function sortRectanglesForPacking(
  rects: readonly Readonly<PackableRectangle>[],
): readonly Readonly<PackableRectangle>[] {
  return [...rects].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) return areaB - areaA;
    if (a.height !== b.height) return b.height - a.height;
    if (a.width !== b.width) return b.width - a.width;
    return compareRectangleId(a.id, b.id);
  });
}

// MaxRects splitting: for every free rectangle overlapping the just-placed footprint, replace it with
// the (up to four) sub-rectangles covering the parts of it the footprint does not cover. The footprint
// is the effective size (rectangle plus padding gutter), so the reserved padding is carved out of the
// free space here.
function splitFreeRectangles(free: FreeRectangle[], placement: Readonly<Placement>): void {
  const usedX = placement.x;
  const usedY = placement.y;
  const usedRight = placement.x + placement.footprintWidth;
  const usedBottom = placement.y + placement.footprintHeight;
  const used: FreeRectangle = {
    x: usedX,
    y: usedY,
    width: placement.footprintWidth,
    height: placement.footprintHeight,
  };

  for (let i = free.length - 1; i >= 0; i--) {
    const node = free[i];
    if (!intersectsRectangle(node, used)) continue;

    const nodeRight = node.x + node.width;
    const nodeBottom = node.y + node.height;
    free.splice(i, 1);

    if (usedX > node.x) free.push({ x: node.x, y: node.y, width: usedX - node.x, height: node.height });
    if (usedRight < nodeRight)
      free.push({ x: usedRight, y: node.y, width: nodeRight - usedRight, height: node.height });
    if (usedY > node.y) free.push({ x: node.x, y: node.y, width: node.width, height: usedY - node.y });
    if (usedBottom < nodeBottom) {
      free.push({ x: node.x, y: usedBottom, width: node.width, height: nodeBottom - usedBottom });
    }
  }
}

// Orders two rectangle ids for the deterministic input sort: numbers before strings, numbers
// ascending, strings lexicographically.
function compareRectangleId(a: RectangleId, b: RectangleId): number {
  const aNumber = typeof a === 'number';
  const bNumber = typeof b === 'number';
  if (aNumber && bNumber) return a - b;
  if (aNumber !== bNumber) return aNumber ? -1 : 1;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

// The default width/height cap when `maxWidth`/`maxHeight` are unset — large enough to be effectively
// unbounded for typical inputs while keeping growth from running away.
const DEFAULT_MAX_EXTENT = 16384;
