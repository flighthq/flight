// Generated from crates/flight-textlayout/src/text_line_breaks.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { findUtf16Unit } from './textUnits.ts';

export function getTextLineBreakIndex(lineBreaks: Readonly<number[]>, startIndex?: number): number {
  if (lineBreaks.length === 0) {
    return -1;
  }
  startIndex = startIndex ?? 0;
  let low = 0;
  let high = lineBreaks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (lineBreaks[middle] >= startIndex) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low < lineBreaks.length ? lineBreaks[low] | 0 : -1;
}

export function getTextLineBreaks(out: number[], text: string): void {
  out.length = 0;
  const units: number[] = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  let start = 0;
  while (start < units.length) {
    const lf = findUtf16Unit(units, 0x000a, start);
    const cr = findUtf16Unit(units, 0x000d, start);
    if (lf === undefined && cr === undefined) {
      break;
    }
    let index = lf ?? units.length;
    if (cr !== undefined) {
      const crIndex = cr;
      index = Math.min(index, crIndex);
    }
    out.push(index);
    start = index + 1;
  }
}
