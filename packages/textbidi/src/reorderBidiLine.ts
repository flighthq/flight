// UAX #9 rule L2: fill `out` with the visual-order → logical-index mapping for the line [start, end),
// given resolved embedding `levels` (from resolveBidiLevels). `out[v]` is the logical code-unit index
// that displays at visual position `v`; `out` is sized to (end - start) and written in place, so a
// caller can reuse one array across lines (allocation-free in the hot path).
//
// L2 reverses each contiguous run of characters at level ≥ N, for every N from the highest level down
// to the lowest odd level. Reversals compose, so a nested RTL-in-LTR (or the reverse) unwinds to the
// correct display order. Levels are read through the current `out` mapping, so successive reversals see
// the already-reordered indices.
export function reorderBidiLine(levels: Readonly<Uint8Array>, start: number, end: number, out: number[]): void {
  const count = end - start;
  out.length = count;
  if (count <= 0) return;

  let highest = 0;
  let lowestOdd = 255;
  for (let i = start; i < end; i++) {
    const level = levels[i];
    out[i - start] = i;
    if (level > highest) highest = level;
    if (level % 2 === 1 && level < lowestOdd) lowestOdd = level;
  }

  for (let level = highest; level >= lowestOdd; level--) {
    for (let k = 0; k < count; ) {
      if (levels[out[k]] >= level) {
        let j = k;
        while (j < count && levels[out[j]] >= level) j++;
        for (let lo = k, hi = j - 1; lo < hi; lo++, hi--) {
          const tmp = out[lo];
          out[lo] = out[hi];
          out[hi] = tmp;
        }
        k = j;
      } else {
        k++;
      }
    }
  }
}
