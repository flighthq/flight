// Generated from crates/flight-textlayout/src/text_units.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export function findUtf16Unit(units: Readonly<number[]>, unit: number, start: number): number | undefined {
  let index = start;
  while (index < units.length) {
    if (units[index] === unit) {
      return index;
    }
    index += 1;
  }
  return undefined;
}

export function jsMax(left: number, right: number): number {
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return Number.NaN;
  }
  return Math.max(left, right);
}

export function jsMin(left: number, right: number): number {
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return Number.NaN;
  }
  return Math.min(left, right);
}

export function utf16CodePointLen(units: Readonly<number[]>, index: number): number {
  const first = units[index];
  if ((first & 0xfc00) === 0xd800 && index + 1 < units.length && (units[index + 1] & 0xfc00) === 0xdc00) {
    return 2;
  }
  return 1;
}

export function utf16Slice(units: Readonly<number[]>, start: number, end: number): string {
  return ((units: Readonly<number[]>): string => {
    let value = '';
    for (let index = 0; index < units.length; index += 0x8000)
      value += String.fromCharCode(...units.slice(index, index + 0x8000));
    return value;
  })(units.slice(start, end));
}
