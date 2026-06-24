/**
 * Binary search for the first break index at or after `startIndex`.
 * Returns -1 when no such break exists. The `lineBreaks` array must be sorted
 * in ascending order (as produced by `getTextLineBreaks`).
 */
export function getTextLineBreakIndex(lineBreaks: readonly number[], startIndex = 0): number {
  if (lineBreaks.length === 0) return -1;
  let lo = 0;
  let hi = lineBreaks.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (lineBreaks[mid] >= startIndex) {
      result = lineBreaks[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return result;
}

export function getTextLineBreaks(out: number[], text: string): void {
  out.length = 0;
  let index = -1;

  while (index < text.length) {
    const lf = text.indexOf('\n', index + 1);
    const cr = text.indexOf('\r', index + 1);

    if (lf === -1 && cr === -1) break;

    index = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf);
    out.push(index);
  }
}
