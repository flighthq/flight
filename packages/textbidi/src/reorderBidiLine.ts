// Generated from crates/flight-textbidi/src/reorder_bidi_line.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export function reorderBidiLine(levels: Readonly<Uint8Array>, start: number, end: number, out: number[]): void {
  if (end < start) {
    throw new RangeError('Invalid array length');
  }
  const count = end - start;
  while (out.length < count) {
    out.push(0);
  }
  out.length = count;
  if (count === 0) {
    return;
  }
  let highest: number = 0;
  let lowestOdd: number = 255;
  for (let i = start; i < end; i++) {
    const level = levels[i];
    out[i - start] = i;
    if (level > highest) {
      highest = level;
    }
    if (level % 2 === 1 && level < lowestOdd) {
      lowestOdd = level;
    }
  }
  let level = highest;
  while (level >= lowestOdd) {
    let k: number = 0;
    while (k < count) {
      if (levels[out[k]] >= level) {
        let j = k;
        while (j < count && levels[out[j]] >= level) {
          j++;
        }
        let lo = k;
        let hi = j - 1;
        while (lo < hi) {
          [out[lo], out[hi]] = [out[hi], out[lo]];
          lo++;
          hi--;
        }
        k = j;
      } else {
        k++;
      }
    }
    if (level === 0) {
      break;
    }
    level--;
  }
}
