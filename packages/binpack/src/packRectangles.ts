// Generated from crates/flight-binpack/src/pack_rectangles.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * The heuristic used by the MaxRects bin packing algorithm.
 */
export type BinPackHeuristic = 'bestShortSideFit' | 'bestAreaFit';

/**
 * A rectangle identifier: either a numeric index or a textual name.
 * Maps to the TS `RectangleId = number | string` union.
 */
export type RectangleId = number | string;

/**
 * Options controlling the bin packing algorithm.
 * Options for `packRectangles`. Every field mirrors the optional TS field: `undefined` means the
 * documented default applies (padding/border 0, rotation/power-of-two/square false, growable true,
 * max extent `BIN_PACK_DEFAULT_MAX_EXTENT`, heuristic `BestShortSideFit`).
 */
export interface BinPackOptions {
  padding?: number;
  border?: number;
  allowRotation?: boolean;
  heuristic?: BinPackHeuristic;
  growable?: boolean;
  powerOfTwo?: boolean;
  square?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * The result of a bin packing operation: the placed rectangles, the bin extents, and the ids of
 * rectangles that did not fit.
 */
export interface PackResult {
  placements: PackedRectangle[];
  width: number;
  height: number;
  unpacked: RectangleId[];
}

/**
 * A rectangle to be packed: its identity and dimensions.
 */
export interface PackableRectangle {
  id: RectangleId;
  width: number;
  height: number;
}

/**
 * A placed rectangle in the output: position, dimensions (possibly swapped if rotated), and
 * whether it was turned 90 degrees.
 */
export interface PackedRectangle {
  id: RectangleId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

/**
 * A free rectangle of unoccupied bin space, in the packer's internal "effective" coordinate space.
 * Mutated in place as free space is split and pruned.
 */
interface FreeRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The chosen placement for one rectangle: its top-left corner in effective space, the effective
 * footprint size occupied (rectangle size plus the trailing padding gutter), and whether it was
 * rotated 90 degrees.
 */
interface Placement {
  x: number;
  y: number;
  footprintWidth: number;
  footprintHeight: number;
  rotated: boolean;
}

/**
 * The intermediate result from packing into a fixed-size bin.
 */
interface BinPackAttempt {
  placements: PackedRectangle[];
  unpacked: RectangleId[];
}

/**
 * The default width/height cap when `maxWidth`/`maxHeight` are unset -- large enough to be
 * effectively unbounded for typical inputs while keeping growth from running away.
 */
export const BIN_PACK_DEFAULT_MAX_EXTENT: number = 16384.0;

/**
 * Rounds `value` up to the next power of two (>= 1). Used only for the final `powerOfTwo`
 * adjustment.
 */
function ceilToPowerOfTwo(value: number): number {
  if (value <= 1.0) {
    return 1.0;
  }
  let result = 1.0;
  while (result < value) {
    result *= 2.0;
  }
  return result;
}

/**
 * Orders two rectangle ids for the deterministic input sort: numbers before strings, numbers
 * ascending, strings lexicographically.
 */
function compareRectangleId(a: Readonly<RectangleId>, b: Readonly<RectangleId>): number {
  const aNumber = typeof a === 'number';
  const bNumber = typeof b === 'number';
  if (aNumber && bNumber) {
    if (typeof a === 'number' && typeof b === 'number') {
      const an = a;
      const bn = b;
      return an < bn ? -1 : an > bn ? 1 : 0;
    }
  }
  if (aNumber !== bNumber) {
    return aNumber ? -1 : 1;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    const aStr = a;
    const bStr = b;
    return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
  }
  return 0;
}

/**
 * Applies the `powerOfTwo` rounding (if set) to a single extent value.
 */
function finalizeExtent(value: number, powerOfTwo: boolean): number {
  if (powerOfTwo && value > 0.0) {
    return ceilToPowerOfTwo(value);
  }
  return value;
}

/**
 * Turns the raw placements from `packIntoBin` into the public `PackResult`, shifting
 * effective-space coordinates back into bin space by `border` and finalizing the reported extent
 * for `square` / `powerOfTwo`.
 */
function finalizeResult(packed: BinPackAttempt, border: number, powerOfTwo: boolean, square: boolean): PackResult {
  let contentRight = 0.0;
  let contentBottom = 0.0;
  for (const placement of packed.placements) {
    contentRight = Math.max(contentRight, placement.x + placement.width);
    contentBottom = Math.max(contentBottom, placement.y + placement.height);
  }
  let width = packed.placements.length !== 0 ? contentRight + border : 0.0;
  let height = packed.placements.length !== 0 ? contentBottom + border : 0.0;
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
  return { placements: packed.placements, width: width, height: height, unpacked: packed.unpacked };
}

/**
 * Best-Short-Side-Fit search: over every free rectangle (and, when rotation is allowed, both
 * orientations of the piece), pick the fit that leaves the smallest leftover short side, breaking
 * ties by smallest leftover long side, then by top-most / left-most free rectangle, then by the
 * unrotated orientation. Returns the chosen placement, or `undefined` when the piece fits nowhere.
 *
 * `pieceWidth`/`pieceHeight` are the effective footprint (rectangle size plus the trailing
 * padding gutter) in the unrotated orientation.
 */
function findBestPlacement(
  free: Readonly<FreeRectangle[]>,
  pieceWidth: number,
  pieceHeight: number,
  allowRotation: boolean,
  heuristic: BinPackHeuristic,
): Placement | undefined {
  let best: Placement | undefined = undefined;
  let bestPrimary = Number.POSITIVE_INFINITY;
  let bestSecondary = Number.POSITIVE_INFINITY;
  for (const node of free) {
    const maxRotated: number = allowRotation ? 1 : 0;
    for (let rotated = 0; rotated <= maxRotated; rotated += 1) {
      const width = rotated === 1 ? pieceHeight : pieceWidth;
      const height = rotated === 1 ? pieceWidth : pieceHeight;
      if (width > node.width || height > node.height) {
        continue;
      }
      const leftoverHorizontal = node.width - width;
      const leftoverVertical = node.height - height;
      const shortSide = Math.min(leftoverHorizontal, leftoverVertical);
      const longSide = Math.max(leftoverHorizontal, leftoverVertical);
      const primary: number = heuristic === 'bestAreaFit' ? node.width * node.height - width * height : shortSide;
      const secondary: number = heuristic === 'bestAreaFit' ? shortSide : longSide;
      if (best === undefined || primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
        best = { x: node.x, y: node.y, footprintWidth: width, footprintHeight: height, rotated: rotated === 1 };
        bestPrimary = primary;
        bestSecondary = secondary;
      }
    }
  }
  return best;
}

export function getBinPackHeuristicString(value: BinPackHeuristic): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'bestShortSideFit':
        return 'bestShortSideFit';
      case 'bestAreaFit':
        return 'bestAreaFit';
    }
  })();
}

/**
 * Fraction of the reported bin actually covered by placements, in [0, 1]. Placed area over
 * `width * height`; 0 for an empty or zero-extent result rather than NaN, since "nothing packed"
 * is an expected outcome and not a division error the caller should have to guard.
 *
 * Measures the REPORTED extent, so power-of-two or square rounding shows up as the padding waste
 * it is -- which is usually the number a caller comparing packings wants to see.
 */
export function getPackResultOccupancy(result: Readonly<PackResult>): number {
  const area = result.width * result.height;
  if (area <= 0.0) {
    return 0.0;
  }
  let placed = 0.0;
  for (const placement of result.placements) {
    placed += placement.width * placement.height;
  }
  return placed / area;
}

/**
 * True when the whole of `a` lies within `b`, used to detect overlap for the intersection test.
 */
function intersectsRectangle(a: Readonly<FreeRectangle>, b: Readonly<FreeRectangle>): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

/**
 * True when the whole of `inner` lies within `outer` -- the containment test used to prune
 * redundant free rectangles after a split.
 */
function isFreeRectangleContained(inner: Readonly<FreeRectangle>, outer: Readonly<FreeRectangle>): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Runs one MaxRects pass at a fixed bin size. Every rectangle is inflated to an "effective"
 * footprint of `(width + padding) x (height + padding)` -- the trailing gutter is what guarantees
 * at least `padding` between neighbors -- and packed into the effective usable region
 * `(binWidth - 2*border + padding) x (binHeight - 2*border + padding)`. This construction makes
 * the actual placement satisfy `x >= border` and `x + width <= binWidth - border` (likewise
 * vertically), so `border` is respected on every side while the last row/column's gutter costs no
 * real space.
 */
function packIntoBin(
  sorted: Readonly<PackableRectangle[]>,
  binWidth: number,
  binHeight: number,
  padding: number,
  border: number,
  allowRotation: boolean,
  heuristic: BinPackHeuristic,
): BinPackAttempt {
  const usableWidth = binWidth - 2.0 * border + padding;
  const usableHeight = binHeight - 2.0 * border + padding;
  let placements: PackedRectangle[] = [] as never[];
  let unpacked: RectangleId[] = [] as never[];
  if (usableWidth <= 0.0 || usableHeight <= 0.0) {
    for (const rect of sorted) {
      unpacked.push(rect.id);
    }
    return { placements: placements, unpacked: unpacked };
  }
  let free: FreeRectangle[] = [{ x: 0.0, y: 0.0, width: usableWidth, height: usableHeight }];
  for (const rect of sorted) {
    const pieceWidth = rect.width + padding;
    const pieceHeight = rect.height + padding;
    let placement = findBestPlacement(free, pieceWidth, pieceHeight, allowRotation, heuristic);
    if (placement === undefined) {
      unpacked.push(rect.id);
      continue;
    }
    placement = placement!;
    placements.push({
      id: rect.id,
      x: placement.x + border,
      y: placement.y + border,
      width: placement.rotated ? rect.height : rect.width,
      height: placement.rotated ? rect.width : rect.height,
      rotated: placement.rotated,
    });
    free = splitFreeRectangles(free, placement);
    free = pruneFreeRectangles(free);
  }
  return { placements: placements, unpacked: unpacked };
}

/**
 * Places a set of rectangles without overlap into a bin using the MaxRects algorithm with the
 * Best-Short-Side-Fit (BSSF) heuristic, and reports each placement, the used bin extent, and any
 * ids that did not fit.
 *
 * The result is deterministic: the same `rects` (by value) and `options` always produce an
 * identical `PackResult`. Inputs are sorted by descending area, then descending height, then
 * width, then id before placement -- a total order with no reliance on sort stability -- and no
 * random state is consulted.
 *
 * Padding and border are honored geometrically: every pair of placements is at least `padding`
 * apart and every placement is at least `border` from the reported bin edge. When `allowRotation`
 * is set, a rectangle may be turned 90 degrees (reported via `rotated` and swapped
 * `width`/`height`) if that fits better. A `growable` bin starts small and grows toward
 * `maxWidth`/`maxHeight`; a fixed bin overflows into `unpacked`. The reported `width`/`height`
 * is the tight used extent, then adjusted for `square` and `powerOfTwo` when those are set.
 */
export function packRectangles(rects: Readonly<PackableRectangle[]>, options?: Readonly<BinPackOptions>): PackResult {
  const padding = options?.padding ?? 0.0;
  const border = options?.border ?? 0.0;
  const allowRotation = options?.allowRotation ?? false;
  const heuristic: BinPackHeuristic = options?.heuristic ?? 'bestShortSideFit';
  const growable = options?.growable ?? true;
  const powerOfTwo = options?.powerOfTwo ?? false;
  const square = options?.square ?? false;
  const maxWidth = options?.maxWidth ?? BIN_PACK_DEFAULT_MAX_EXTENT;
  const maxHeight = options?.maxHeight ?? BIN_PACK_DEFAULT_MAX_EXTENT;
  if (rects.length === 0) {
    return {
      placements: [],
      width: finalizeExtent(0.0, powerOfTwo),
      height: finalizeExtent(0.0, powerOfTwo),
      unpacked: [],
    };
  }
  let degenerate: RectangleId[] = [] as never[];
  let placeable: PackableRectangle[] = [] as never[];
  for (const rect of rects) {
    if (rect.width > 0.0 && rect.height > 0.0) {
      placeable.push({ id: rect.id, width: rect.width, height: rect.height });
    } else {
      degenerate.push(rect.id);
    }
  }
  if (placeable.length === 0) {
    return {
      placements: [],
      width: finalizeExtent(0.0, powerOfTwo),
      height: finalizeExtent(0.0, powerOfTwo),
      unpacked: degenerate,
    };
  }
  const sorted = sortRectanglesForPacking(placeable);
  let needWidth = 2.0 * border;
  let needHeight = 2.0 * border;
  let totalArea = 0.0;
  for (const rect of sorted) {
    const shortSide = Math.min(rect.width, rect.height);
    const requiredWidth = (allowRotation ? shortSide : rect.width) + 2.0 * border;
    const requiredHeight = (allowRotation ? shortSide : rect.height) + 2.0 * border;
    needWidth = Math.max(needWidth, requiredWidth);
    needHeight = Math.max(needHeight, requiredHeight);
    totalArea += (rect.width + padding) * (rect.height + padding);
  }
  const seed = Math.ceil(Math.sqrt(totalArea)) + 2.0 * border;
  let binWidth = growable ? Math.min(Math.max(seed, needWidth), maxWidth) : maxWidth;
  let binHeight = growable ? Math.min(Math.max(seed, needHeight), maxHeight) : maxHeight;
  let attempt = packIntoBin(sorted, binWidth, binHeight, padding, border, allowRotation, heuristic);
  while (attempt.unpacked.length !== 0 && growable && (binWidth < maxWidth || binHeight < maxHeight)) {
    if (binWidth <= binHeight && binWidth < maxWidth) {
      binWidth = Math.min(binWidth * 2.0, maxWidth);
    } else {
      if (binHeight < maxHeight) {
        binHeight = Math.min(binHeight * 2.0, maxHeight);
      } else {
        binWidth = Math.min(binWidth * 2.0, maxWidth);
      }
    }
    attempt = packIntoBin(sorted, binWidth, binHeight, padding, border, allowRotation, heuristic);
  }
  let combinedUnpacked = degenerate;
  for (let index = 0, count = attempt.unpacked.length; index < count; index++) {
    combinedUnpacked.push(attempt.unpacked[index]);
  }
  const combined = { placements: attempt.placements, unpacked: combinedUnpacked };
  return finalizeResult(combined, border, powerOfTwo, square);
}

export function parseBinPackHeuristic(value: string): BinPackHeuristic | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'bestShortSideFit':
        return 'bestShortSideFit';
      case 'bestAreaFit':
        return 'bestAreaFit';
      default:
        return undefined;
    }
  })();
}

/**
 * Removes any free rectangle fully contained within another. MaxRects splitting can leave
 * redundant free rectangles nested inside larger ones; pruning them keeps the search cheap and the
 * free list non-redundant.
 */
function pruneFreeRectangles(free: Readonly<FreeRectangle[]>): FreeRectangle[] {
  let active = new Array(free.length).fill(true);
  let i: number = 0;
  while (i < free.length) {
    if (!active[i]) {
      i += 1;
      continue;
    }
    let j = i + 1;
    let iRemoved = false;
    while (j < free.length) {
      if (!active[j]) {
        j += 1;
        continue;
      }
      const fi = free[i];
      const fj = free[j];
      if (isFreeRectangleContained(fi, fj)) {
        active[i] = false;
        iRemoved = true;
        break;
      }
      if (isFreeRectangleContained(fj, fi)) {
        active[j] = false;
      }
      j += 1;
    }
    if (!iRemoved) {
      i += 1;
    }
  }
  let pruned: FreeRectangle[] = [] as never[];
  for (let index = 0; index < free.length; index += 1) {
    if (active[index]) {
      pruned.push(free[index]);
    }
  }
  return pruned;
}

/**
 * Deterministic total order over the input rectangles: descending area, then descending height,
 * then descending width, then ascending id (numbers before strings; numbers numerically, strings
 * lexicographically). Returns a new vector; the input is not mutated.
 */
function sortRectanglesForPacking(rects: Readonly<PackableRectangle[]>): PackableRectangle[] {
  let sorted: PackableRectangle[] = [...rects];
  sorted.sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) {
      return areaB - areaA;
    }
    if (a.height !== b.height) {
      return b.height - a.height;
    }
    if (a.width !== b.width) {
      return b.width - a.width;
    }
    return compareRectangleId(a.id, b.id);
  });
  return sorted;
}

/**
 * MaxRects splitting: for every free rectangle overlapping the just-placed footprint, replace it
 * with the (up to four) sub-rectangles covering the parts of it the footprint does not cover. The
 * footprint is the effective size (rectangle plus padding gutter), so the reserved padding is
 * carved out of the free space here.
 */
function splitFreeRectangles(free: Readonly<FreeRectangle[]>, placement: Readonly<Placement>): FreeRectangle[] {
  const usedX = placement.x;
  const usedY = placement.y;
  const usedRight = placement.x + placement.footprintWidth;
  const usedBottom = placement.y + placement.footprintHeight;
  const used = { x: usedX, y: usedY, width: placement.footprintWidth, height: placement.footprintHeight };
  let split: FreeRectangle[] = [] as never[];
  for (const node of free) {
    if (!intersectsRectangle(node, used)) {
      split.push(node);
    }
  }
  let i = (free.length | 0) - 1;
  while (i >= 0) {
    const idx = i >>> 0;
    const node = free[idx];
    if (!intersectsRectangle(node, used)) {
      i -= 1;
      continue;
    }
    const nodeRight = node.x + node.width;
    const nodeBottom = node.y + node.height;
    if (usedX > node.x) {
      split.push({ x: node.x, y: node.y, width: usedX - node.x, height: node.height });
    }
    if (usedRight < nodeRight) {
      split.push({ x: usedRight, y: node.y, width: nodeRight - usedRight, height: node.height });
    }
    if (usedY > node.y) {
      split.push({ x: node.x, y: node.y, width: node.width, height: usedY - node.y });
    }
    if (usedBottom < nodeBottom) {
      split.push({ x: node.x, y: usedBottom, width: node.width, height: nodeBottom - usedBottom });
    }
    i -= 1;
  }
  return split;
}
