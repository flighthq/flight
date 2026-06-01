import type {
  InputTextSelectionRectangle,
  Rectangle,
  TextLayoutGroup,
  TextLayoutResult,
  TextLineMetrics,
} from '@flighthq/types';

export function getRichTextCharBoundaries(
  out: Rectangle,
  text: string,
  layout: Readonly<TextLayoutResult>,
  charIndex: number,
): boolean {
  const group = getGroupContainingIndex(layout, charIndex);
  if (group === null) return false;

  let x = group.offsetX;
  const limit = Math.min(charIndex - group.startIndex, group.positions.length);
  for (let i = 0; i < limit; i++) x += group.positions[i] ?? 0;

  const charWidth = group.positions[charIndex - group.startIndex] ?? 0;
  out.x = x;
  out.y = group.offsetY;
  out.width = charWidth;
  out.height = group.height;
  return true;
}

export function getRichTextCharIndexAtPoint(
  text: string,
  layout: Readonly<TextLayoutResult>,
  x: number,
  y: number,
): number {
  if (layout.groups.length === 0) return 0;

  let closestLineIndex = 0;
  let closestDist = Infinity;
  for (let i = 0; i < layout.lineHeights.length; i++) {
    const lineTop = getLineOffsetY(layout, i);
    const lineBottom = lineTop + layout.lineHeights[i];
    const dist = y < lineTop ? lineTop - y : y > lineBottom ? y - lineBottom : 0;
    if (dist < closestDist) {
      closestDist = dist;
      closestLineIndex = i;
    }
  }

  let lineStart = text.length;
  let lineEnd = 0;
  for (const group of layout.groups) {
    if (group.lineIndex !== closestLineIndex) continue;
    lineStart = Math.min(lineStart, group.startIndex);
    lineEnd = Math.max(lineEnd, group.endIndex);
    if (x <= group.offsetX) return group.startIndex;
    if (x <= group.offsetX + group.width) {
      let gx = group.offsetX;
      for (let i = 0; i < group.positions.length; i++) {
        const advance = group.positions[i] ?? 0;
        if (x < gx + advance / 2) return group.startIndex + i;
        gx += advance;
      }
      return group.endIndex;
    }
  }

  return lineEnd > 0 ? lineEnd : lineStart;
}

export function getRichTextFirstCharInParagraph(text: string, charIndex: number): number {
  const clamped = Math.max(0, Math.min(text.length, charIndex));
  for (let i = clamped - 1; i >= 0; i--) {
    if (text[i] === '\n') return i + 1;
  }
  return 0;
}

export function getRichTextLineIndexAtPoint(layout: Readonly<TextLayoutResult>, y: number): number {
  let closestLineIndex = 0;
  let closestDist = Infinity;
  for (let i = 0; i < layout.lineHeights.length; i++) {
    const lineTop = getLineOffsetY(layout, i);
    const lineBottom = lineTop + layout.lineHeights[i];
    const dist = y < lineTop ? lineTop - y : y > lineBottom ? y - lineBottom : 0;
    if (dist < closestDist) {
      closestDist = dist;
      closestLineIndex = i;
    }
  }
  return closestLineIndex;
}

export function getRichTextLineIndexOfChar(layout: Readonly<TextLayoutResult>, charIndex: number): number {
  const group = getGroupContainingIndex(layout, charIndex);
  return group?.lineIndex ?? 0;
}

export function getRichTextLineLength(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  let start = Infinity;
  let end = 0;
  for (const group of layout.groups) {
    if (group.lineIndex !== lineIndex) continue;
    start = Math.min(start, group.startIndex);
    end = Math.max(end, group.endIndex);
  }
  return start === Infinity ? 0 : end - start;
}

export function getRichTextLineMetrics(layout: Readonly<TextLayoutResult>, lineIndex: number): TextLineMetrics | null {
  let ascent = 0;
  let descent = 0;
  let leading = 0;
  let x = Infinity;
  let right = 0;
  let found = false;

  for (const group of layout.groups) {
    if (group.lineIndex !== lineIndex) continue;
    found = true;
    ascent = Math.max(ascent, group.ascent);
    descent = Math.max(descent, group.descent);
    leading = Math.max(leading, group.leading);
    x = Math.min(x, group.offsetX);
    right = Math.max(right, group.offsetX + group.width);
  }

  if (!found) return null;
  return {
    ascent,
    descent,
    height: layout.lineHeights[lineIndex] ?? ascent + descent + leading,
    leading,
    width: right - x,
    x: x === Infinity ? 0 : x,
  };
}

export function getRichTextLineOffset(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) return group.startIndex;
  }
  return 0;
}

export function getRichTextLineText(text: string, layout: Readonly<TextLayoutResult>, lineIndex: number): string {
  let start = Infinity;
  let end = 0;
  for (const group of layout.groups) {
    if (group.lineIndex !== lineIndex) continue;
    start = Math.min(start, group.startIndex);
    end = Math.max(end, group.endIndex);
  }
  return start === Infinity ? '' : text.slice(start, end);
}

export function getRichTextLinkAtPoint(layout: Readonly<TextLayoutResult>, x: number, y: number): string | null {
  for (const group of layout.groups) {
    if (!group.format.url) continue;
    if (
      x >= group.offsetX &&
      x <= group.offsetX + group.width &&
      y >= group.offsetY &&
      y <= group.offsetY + group.height
    ) {
      return group.format.url;
    }
  }
  return null;
}

export function getRichTextParagraphLength(text: string, charIndex: number): number {
  const start = getRichTextFirstCharInParagraph(text, charIndex);
  const newline = text.indexOf('\n', start);
  const end = newline === -1 ? text.length : newline + 1;
  return end - start;
}

export function getRichTextSelectionRectangles(
  out: InputTextSelectionRectangle[],
  beginIndex: number,
  endIndex: number,
  layout: Readonly<TextLayoutResult>,
): void {
  out.length = 0;
  if (beginIndex === endIndex) return;
  const start = Math.min(beginIndex, endIndex);
  const end = Math.max(beginIndex, endIndex);

  for (const group of layout.groups) {
    const groupStart = Math.max(start, group.startIndex);
    const groupEnd = Math.min(end, group.endIndex);
    if (groupStart >= groupEnd) continue;

    const x = getCaretX(group, groupStart);
    const right = getCaretX(group, groupEnd);
    out.push({ height: group.height, lineIndex: group.lineIndex, width: right - x, x, y: group.offsetY });
  }
}

function getCaretX(group: Readonly<TextLayoutGroup>, index: number): number {
  let x = group.offsetX;
  const limit = Math.max(0, Math.min(index, group.endIndex) - group.startIndex);
  for (let i = 0; i < limit; i++) x += group.positions[i] ?? 0;
  return x;
}

function getGroupContainingIndex(layout: Readonly<TextLayoutResult>, charIndex: number) {
  for (const group of layout.groups) {
    if (charIndex >= group.startIndex && charIndex < group.endIndex) return group;
  }
  return layout.groups[layout.groups.length - 1] ?? null;
}

function getLineOffsetY(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) return group.offsetY;
  }
  let y = 2;
  for (let i = 0; i < lineIndex; i++) y += layout.lineHeights[i] ?? 0;
  return y;
}
