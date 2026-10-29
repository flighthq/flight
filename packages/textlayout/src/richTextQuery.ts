// Generated from crates/flight-textlayout/src/rich_text_query.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { Rectangle } from '@flighthq/geometry/contract';

import { TEXT_LAYOUT_GUTTER } from './textLayout.ts';
import { jsMax, jsMin, utf16Slice } from './textUnits.ts';
import type { TextLayoutGroup, TextLayoutResult, TextLineMetrics, TextSelectionRectangle } from './types.ts';

export function computeRichTextCharIndexAtPoint(layout: Readonly<TextLayoutResult>, x: number, y: number): number {
  if (layout.groups.length === 0) {
    return 0;
  }
  let closestLineIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestLineBottom = 0.0;
  for (let index = 0; index < layout.lineHeights.length; index += 1) {
    const lineTop = richTextGetLineOffsetY(layout, index);
    const lineBottom = lineTop + getF32(layout.lineHeights, index, 0.0);
    const distance = y < lineTop ? lineTop - y : y > lineBottom ? y - lineBottom : 0.0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestLineIndex = index;
      closestLineBottom = lineBottom;
    }
  }
  if (y > closestLineBottom) {
    let lineEnd = 0;
    for (const group of layout.groups) {
      if (group.lineIndex === closestLineIndex) {
        lineEnd = Math.max(lineEnd, group.endIndex);
      }
    }
    return lineEnd;
  }
  let lineStart = layout.groups.length === 0 ? 0 : layout.groups[layout.groups.length - 1].endIndex;
  let lineEnd = 0;
  for (const group of layout.groups) {
    if (group.lineIndex !== closestLineIndex) {
      continue;
    }
    lineStart = Math.min(lineStart, group.startIndex);
    lineEnd = Math.max(lineEnd, group.endIndex);
    if (x <= group.offsetX) {
      return group.startIndex;
    }
    if (x <= group.offsetX + group.width) {
      let groupX = group.offsetX;
      for (const [index, advance] of group.positions.entries()) {
        if (x <= groupX + advance / 2.0) {
          return group.startIndex + index;
        }
        groupX += advance;
      }
      return group.endIndex;
    }
  }
  return lineEnd > 0 ? lineEnd : lineStart;
}

export function computeRichTextLineMetrics(
  layout: Readonly<TextLayoutResult>,
  lineIndex: number,
): TextLineMetrics | undefined {
  let ascent = 0.0;
  let descent = 0.0;
  let leading = 0.0;
  let x = Number.POSITIVE_INFINITY;
  let right = 0.0;
  let found = false;
  for (const group of layout.groups) {
    if (group.lineIndex !== lineIndex) {
      continue;
    }
    found = true;
    ascent = jsMax(ascent, group.ascent);
    descent = jsMax(descent, group.descent);
    leading = jsMax(leading, group.leading);
    x = jsMin(x, group.offsetX);
    right = jsMax(right, group.offsetX + group.width);
  }
  if (!found) {
    return undefined;
  }
  return {
    ascent: ascent,
    descent: descent,
    height: getF32(layout.lineHeights, lineIndex, ascent + descent + leading),
    leading: leading,
    width: right - x,
    x: x === Number.POSITIVE_INFINITY ? 0.0 : x,
  };
}

export function getRichTextCharBoundaries(
  out: Rectangle,
  layout: Readonly<TextLayoutResult>,
  charIndex: number,
): boolean {
  const group = richTextGetGroupContainingIndex(layout, charIndex);
  if (group === undefined) {
    return false;
  }
  let x = group.offsetX;
  const limit = Math.min(charIndex - group.startIndex, group.positions.length);
  for (let index = 0; index < limit; index += 1) {
    x += getF32(group.positions, index, 0.0);
  }
  out.x = x;
  out.y = group.offsetY;
  out.width = getF32(group.positions, charIndex - group.startIndex, 0.0);
  out.height = group.height;
  return true;
}

export function getRichTextFirstCharInParagraph(text: string, charIndex: number): number {
  const units: number[] = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  const clamped = Math.min(charIndex, units.length);
  for (const index of [...Array.from({ length: clamped - 0 }, (_, index) => 0 + index)].reverse()) {
    if (units[index] === 0x000a) {
      return index + 1;
    }
  }
  return 0;
}

export function getRichTextLineIndexAtPoint(layout: Readonly<TextLayoutResult>, y: number): number {
  let closestLineIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.lineHeights.length; index += 1) {
    const lineTop = richTextGetLineOffsetY(layout, index);
    const lineBottom = lineTop + layout.lineHeights[index];
    const distance = y < lineTop ? lineTop - y : y > lineBottom ? y - lineBottom : 0.0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestLineIndex = index;
    }
  }
  return closestLineIndex;
}

export function getRichTextLineIndexOfChar(layout: Readonly<TextLayoutResult>, charIndex: number): number {
  return richTextGetGroupContainingIndex(layout, charIndex)?.lineIndex ?? 0;
}

export function getRichTextLineLength(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  let start = 0;
  let end = 0;
  let found = false;
  for (const group of layout.groups) {
    if (group.lineIndex !== lineIndex) {
      continue;
    }
    if (!found || group.startIndex < start) {
      start = group.startIndex;
    }
    end = Math.max(end, group.endIndex);
    found = true;
  }
  return found ? end - start : 0;
}

export function getRichTextLineOffset(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) {
      return group.startIndex;
    }
  }
  return 0;
}

export function getRichTextLineText(text: string, layout: Readonly<TextLayoutResult>, lineIndex: number): string {
  let start = 0;
  let end = 0;
  let found = false;
  for (const group of layout.groups) {
    if (group.lineIndex !== lineIndex) {
      continue;
    }
    if (!found || group.startIndex < start) {
      start = group.startIndex;
    }
    end = Math.max(end, group.endIndex);
    found = true;
  }
  if (!found) {
    return '';
  }
  const units: number[] = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  return utf16Slice(units, Math.min(start, units.length), Math.min(end, units.length));
}

export function getRichTextLinkAtPoint(layout: Readonly<TextLayoutResult>, x: number, y: number): string | undefined {
  for (const group of layout.groups) {
    const url = group.format!.url;
    if (url === undefined) {
      continue;
    }
    if (
      x >= group.offsetX &&
      x <= group.offsetX + group.width &&
      y >= group.offsetY &&
      y <= group.offsetY + group.height
    ) {
      return url;
    }
  }
  return undefined;
}

export function getRichTextParagraphLength(text: string, charIndex: number): number {
  const units: number[] = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  const start = getRichTextFirstCharInParagraph(text, charIndex);
  let end = units.length;
  for (const [offset, unit] of units.slice(start).entries()) {
    if (unit === 0x000a) {
      end = start + offset + 1;
      break;
    }
  }
  return end - start;
}

export function getRichTextSelectionRectangles(
  out: TextSelectionRectangle[],
  beginIndex: number,
  endIndex: number,
  layout: Readonly<TextLayoutResult>,
): void {
  out.length = 0;
  if (beginIndex === endIndex) {
    return;
  }
  const start = Math.min(beginIndex, endIndex);
  const end = Math.max(beginIndex, endIndex);
  for (const group of layout.groups) {
    const groupStart = Math.max(start, group.startIndex);
    const groupEnd = Math.min(end, group.endIndex);
    if (groupStart >= groupEnd) {
      continue;
    }
    const x = richTextGetCaretX(group, groupStart);
    const right = richTextGetCaretX(group, groupEnd);
    out.push({ height: group.height, lineIndex: group.lineIndex, width: right - x, x: x, y: group.offsetY });
  }
}

function richTextGetCaretX(group: Readonly<TextLayoutGroup>, index: number): number {
  let x = group.offsetX;
  const limit = Math.max(0, Math.min(index, group.endIndex) - group.startIndex);
  for (let positionIndex = 0; positionIndex < limit; positionIndex += 1) {
    x += getF32(group.positions, positionIndex, 0.0);
  }
  return x;
}

function richTextGetGroupContainingIndex(
  layout: Readonly<TextLayoutResult>,
  charIndex: number,
): Readonly<TextLayoutGroup> | undefined {
  return layout.groups.find((group) => charIndex >= group.startIndex && charIndex < group.endIndex);
}

function richTextGetLineOffsetY(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) {
      return group.offsetY;
    }
  }
  let y = TEXT_LAYOUT_GUTTER;
  for (let index = 0; index < lineIndex; index += 1) {
    y += getF32(layout.lineHeights, index, 0.0);
  }
  return y;
}

function getF32(values: Readonly<number[]>, index: number, fallback: number): number {
  return index < values.length ? values[index] : fallback;
}
