// Generated from crates/flight-textinput/src/text_units.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export function jsRound(value: number): number {
  if (!Number.isFinite(value) || value % 1 === 0.0) {
    return value;
  }
  return Math.floor(value + 0.5);
}

export function utf16Len(value: string): number {
  return Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)).length;
}

export function utf16Replace(value: string, start: number, end: number, replacement: string): string {
  const units: number[] = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  start = Math.min(start, units.length);
  end = Math.max(Math.min(end, units.length), start);
  let out: number[] = [] as never[];
  for (let index = 0; index < start; index += 1) {
    out.push(units[index]);
  }
  {
    const source = Array.from({ length: replacement.length }, (_, index) => replacement.charCodeAt(index));
    for (let index1 = 0, count = source.length; index1 < count; index1++) {
      out.push(source[index1]);
    }
  }
  for (let index = end; index < units.length; index += 1) {
    out.push(units[index]);
  }
  return ((units: Readonly<number[]>): string => {
    let value = '';
    for (let index = 0; index < units.length; index += 0x8000)
      value += String.fromCharCode(...units.slice(index, index + 0x8000));
    return value;
  })(out);
}

export function utf16Slice(value: string, start: number, end: number): string {
  const units: number[] = Array.from({ length: value.length }, (_, index) => value.charCodeAt(index));
  start = Math.min(start, units.length);
  end = Math.max(Math.min(end, units.length), start);
  return ((units: Readonly<number[]>): string => {
    let value = '';
    for (let index = 0; index < units.length; index += 0x8000)
      value += String.fromCharCode(...units.slice(index, index + 0x8000));
    return value;
  })(units.slice(start, end));
}
