export function getTextLineBreakIndex(lineBreaks: readonly number[], startIndex = 0): number {
  for (const lb of lineBreaks) {
    if (lb >= startIndex) return lb;
  }
  return -1;
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
