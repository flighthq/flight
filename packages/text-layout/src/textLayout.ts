import type { TextAutoSize, TextFormat } from '@flighthq/types';

import { getFormatAscent, getFormatDescent, getFormatLeading, mergeTextFormat } from './textFormat';
import type { TextFormatRange } from './textFormatRange';
import type { TextLayoutGroup } from './textLayoutGroup';
import { createTextLayoutGroup } from './textLayoutGroup';
import { getLineBreaks } from './textLineBreaks';

const GUTTER = 2;
const _lineBreaks: number[] = [];
const _charAdvances: number[] = [];

export type TextMeasureFn = (text: string, format: TextFormat) => number;

export interface TextLayoutParams {
  autoSize?: TextAutoSize;
  border?: boolean;
  formatRanges: readonly TextFormatRange[];
  height: number;
  measure: TextMeasureFn;
  multiline?: boolean;
  text: string;
  width: number;
  wordWrap?: boolean;
}

export interface TextLayoutResult {
  groups: TextLayoutGroup[];
  lineAscents: number[];
  lineDescents: number[];
  lineHeights: number[];
  lineLeadings: number[];
  lineWidths: number[];
  numLines: number;
  textHeight: number;
  textWidth: number;
}

export function createTextLayoutResult(): TextLayoutResult {
  return {
    groups: [],
    lineAscents: [],
    lineDescents: [],
    lineHeights: [],
    lineLeadings: [],
    lineWidths: [],
    numLines: 0,
    textHeight: 0,
    textWidth: 0,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function charAdvances(out: number[], text: string, format: TextFormat, start: number, end: number, measure: TextMeasureFn): void {
  out.length = 0;
  const letterSpacing = format.letterSpacing ?? 0;

  for (let i = start; i < end; i++) {
    let advance: number;
    if (i < text.length - 1) {
      // Pair-wise measurement accounts for kerning between adjacent characters.
      const nextW = measure(text.charAt(i + 1), format);
      const pairW = measure(text.substr(i, 2), format);
      advance = pairW - nextW;
    } else {
      advance = measure(text.charAt(i), format);
    }
    out.push(advance + letterSpacing);
  }
}

function sumAdvances(positions: number[]): number {
  let total = 0;
  for (const p of positions) total += p;
  return total;
}

// ---------------------------------------------------------------------------
// Layout group construction
// ---------------------------------------------------------------------------

function buildGroups(
  out: TextLayoutGroup[],
  text: string,
  formatRanges: readonly TextFormatRange[],
  lineBreaks: number[],
  containerWidth: number,
  measure: TextMeasureFn,
  wordWrap: boolean,
  multiline: boolean,
): void {
  out.length = 0;
  const groups = out;

  let rangeIndex = 0;
  let formatRange = formatRanges[0];
  let currentFormat: TextFormat = { ...formatRange.format };

  // Paragraph-level properties — taken from the first character of each paragraph.
  let leftMargin = currentFormat.leftMargin ?? 0;
  let rightMargin = currentFormat.rightMargin ?? 0;
  let blockIndent = currentFormat.blockIndent ?? 0;
  let indent = currentFormat.indent ?? 0;
  let firstLineOfParagraph = true;

  // Line-level metrics.
  let ascent = getFormatAscent(currentFormat);
  let descent = getFormatDescent(currentFormat);
  let leading = getFormatLeading(currentFormat);
  let lineHeight = Math.ceil(ascent + descent + leading);
  let maxAscent = ascent;
  let maxLineHeight = lineHeight;

  let textIndex = 0;
  let lineIndex = 0;
  let offsetX = 0;
  let offsetY = 0;

  let breakCount = 0;
  let breakIndex = lineBreaks.length > 0 ? lineBreaks[0] : -1;
  let spaceIndex = text.indexOf(' ');
  let prevSpaceIndex = -2;

  let activeGroup: TextLayoutGroup | null = null;

  // --- Local helpers that close over the mutable state above ---

  function baseX(): number {
    return GUTTER + leftMargin + blockIndent + (firstLineOfParagraph ? indent : 0);
  }

  function wrapWidth(): number {
    return containerWidth - GUTTER - rightMargin - baseX();
  }

  function updateLineMetrics(): void {
    ascent = getFormatAscent(currentFormat);
    descent = getFormatDescent(currentFormat);
    leading = getFormatLeading(currentFormat);
    lineHeight = Math.ceil(ascent + descent + leading);
    if (lineHeight > maxLineHeight) maxLineHeight = lineHeight;
    if (ascent > maxAscent) maxAscent = ascent;
  }

  function updateParagraphMetrics(): void {
    firstLineOfParagraph = true;
    leftMargin = currentFormat.leftMargin ?? 0;
    rightMargin = currentFormat.rightMargin ?? 0;
    blockIndent = currentFormat.blockIndent ?? 0;
    indent = currentFormat.indent ?? 0;
  }

  function advanceFormatRange(): boolean {
    if (rangeIndex < formatRanges.length - 1) {
      rangeIndex++;
      formatRange = formatRanges[rangeIndex];
      currentFormat = mergeTextFormat(currentFormat, formatRange.format);
      return true;
    }
    return false;
  }

  // Finalise the current line: set max ascent/height on all groups in it,
  // then advance the pen to the next line.
  function commitLine(): void {
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (g.lineIndex < lineIndex) break;
      g.ascent = maxAscent;
      g.height = maxLineHeight;
    }
    offsetY += maxLineHeight;
    maxAscent = 0;
    maxLineHeight = 0;
    lineIndex++;
    offsetX = 0;
    firstLineOfParagraph = false;
    activeGroup = null;
  }

  // Place a contiguous span [start, end) of text, respecting format range
  // boundaries (may emit multiple groups if the span crosses a format change).
  function placeSpan(start: number, end: number): void {
    let idx = start;

    while (idx < end) {
      const rangeEnd = Math.min(end, formatRange.end);

      if (idx < rangeEnd) {
        if (activeGroup === null || activeGroup.startIndex !== activeGroup.endIndex) {
          activeGroup = createTextLayoutGroup(formatRange.format, idx, rangeEnd);
          groups.push(activeGroup);
        } else {
          activeGroup.format = formatRange.format;
          activeGroup.startIndex = idx;
          activeGroup.endIndex = rangeEnd;
        }

        charAdvances(activeGroup.positions, text, currentFormat, idx, rangeEnd, measure);
        const spanWidth = sumAdvances(activeGroup.positions);
        activeGroup.offsetX = offsetX + baseX();
        activeGroup.ascent = ascent;
        activeGroup.descent = descent;
        activeGroup.leading = leading;
        activeGroup.lineIndex = lineIndex;
        activeGroup.offsetY = offsetY + GUTTER;
        activeGroup.width = spanWidth;
        activeGroup.height = lineHeight;

        offsetX += spanWidth;
        idx = rangeEnd;
      }

      if (idx >= end) break;

      if (!advanceFormatRange()) break;
      updateLineMetrics();
    }

    textIndex = end;

    // Step past exhausted format ranges so the next placeSpan call starts
    // in the right range.
    while (textIndex >= formatRange.end && rangeIndex < formatRanges.length - 1) {
      advanceFormatRange();
      updateLineMetrics();
    }
  }

  // Measure a span without placing it (saves/restores rangeIndex state).
  function measureSpan(start: number, end: number): { positions: number[]; width: number } {
    if (start >= end) return { positions: [], width: 0 };

    let savedRangeIndex = rangeIndex;
    let savedFormat = { ...currentFormat };
    let savedFormatRange = formatRange;

    let idx = start;
    const allPositions: number[] = [];

    while (idx < end) {
      const rangeEnd = Math.min(end, formatRange.end);
      if (idx < rangeEnd) {
        charAdvances(_charAdvances, text, currentFormat, idx, rangeEnd, measure);
        for (const p of _charAdvances) allPositions.push(p);
        idx = rangeEnd;
      }
      if (idx >= end) break;
      if (!advanceFormatRange()) break;
    }

    // Restore
    rangeIndex = savedRangeIndex;
    formatRange = savedFormatRange;
    currentFormat = savedFormat;

    return { positions: allPositions, width: sumAdvances(allPositions) };
  }

  // Break a run [textIndex, end) across lines when word-wrap is active and the
  // run is a single long word that exceeds the wrap width.
  function breakLongWord(end: number): void {
    let remaining = textIndex;

    while (remaining < end) {
      charAdvances(_charAdvances, text, currentFormat, remaining, end, measure);
      const totalW = sumAdvances(_charAdvances);

      if (offsetX + totalW <= wrapWidth()) {
        placeSpan(remaining, end);
        return;
      }

      // Find the largest prefix that fits.
      let count = 0;
      let w = 0;
      while (count < _charAdvances.length && offsetX + w + _charAdvances[count] <= wrapWidth()) {
        w += _charAdvances[count++];
      }
      if (count === 0) count = 1; // always place at least one character

      placeSpan(remaining, remaining + count);
      commitLine();
      remaining += count;
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  updateLineMetrics();
  updateParagraphMetrics();

  while (textIndex <= text.length) {
    const hasBreak = breakIndex !== -1;
    const breakBeforeSpace = hasBreak && (spaceIndex === -1 || breakIndex <= spaceIndex);

    if (breakBeforeSpace) {
      // Place text up to the line break character.
      if (textIndex <= breakIndex) {
        placeSpan(textIndex, breakIndex);
        activeGroup = null;
      }

      commitLine();

      if (!multiline) break;

      textIndex = breakIndex + 1;
      breakCount++;
      breakIndex = breakCount < lineBreaks.length ? lineBreaks[breakCount] : -1;
      spaceIndex = text.indexOf(' ', textIndex);
      prevSpaceIndex = -2;

      updateParagraphMetrics();
      updateLineMetrics();
    } else if (spaceIndex !== -1) {
      // Determine the segment to try placing: from textIndex to end of the
      // word that follows this space (i.e. including the space itself).
      const wordEnd = spaceIndex + 1;
      const segEnd = hasBreak && breakIndex < wordEnd ? breakIndex : wordEnd;

      const { positions: segPos, width: segWidth } = measureSpan(textIndex, segEnd);

      let shouldWrap = wordWrap && containerWidth >= GUTTER * 2 && offsetX + segWidth > wrapWidth();

      // If the overrun is only due to the trailing space, don't wrap.
      if (shouldWrap && segEnd === wordEnd && segPos.length > 0) {
        const trailingSpace = segPos[segPos.length - 1];
        if (offsetX + segWidth - trailingSpace <= wrapWidth()) shouldWrap = false;
      }

      if (shouldWrap) {
        // Trim trailing space from the last group on the current line.
        const trimTarget = activeGroup ?? (groups.length > 0 ? groups[groups.length - 1] : null);
        if (trimTarget && trimTarget.positions.length > 0 && trimTarget.lineIndex === lineIndex) {
          const trailingW = trimTarget.positions[trimTarget.positions.length - 1];
          trimTarget.width -= trailingW;
          trimTarget.endIndex--;
        }

        commitLine();

        // Skip leading space of the newly wrapped line.
        if (textIndex === prevSpaceIndex + 1) textIndex++;
      }

      placeSpan(textIndex, segEnd);
      prevSpaceIndex = spaceIndex;
      spaceIndex = text.indexOf(' ', wordEnd);
    } else {
      // No more spaces or breaks — place the remainder of the text.
      if (textIndex >= text.length) break;

      if (wordWrap && containerWidth >= GUTTER * 2) {
        breakLongWord(text.length);
      } else {
        placeSpan(textIndex, text.length);
      }
      break;
    }
  }

  // Commit the final line.
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g.lineIndex < lineIndex) break;
    g.ascent = maxAscent || g.ascent;
    g.height = maxLineHeight || g.height;
  }

}

// ---------------------------------------------------------------------------
// Alignment pass
// ---------------------------------------------------------------------------

function applyAlignment(groups: TextLayoutGroup[], containerWidth: number, lineWidths: number[]): void {
  for (const g of groups) {
    const lineW = lineWidths[g.lineIndex];
    const align = g.format.align ?? 'left';
    let shift = 0;

    if (align === 'right') {
      shift = containerWidth - lineW - GUTTER * 2;
    } else if (align === 'center') {
      shift = (containerWidth - lineW - GUTTER * 2) / 2;
    }

    if (shift !== 0) g.offsetX += shift;
  }
}

// ---------------------------------------------------------------------------
// Line metrics pass
// ---------------------------------------------------------------------------

function writeLineMetrics(out: TextLayoutResult, groups: readonly TextLayoutGroup[]): void {
  out.lineAscents.length = 0;
  out.lineDescents.length = 0;
  out.lineHeights.length = 0;
  out.lineLeadings.length = 0;
  out.lineWidths.length = 0;
  out.textWidth = 0;
  out.textHeight = 0;
  out.numLines = 0;

  for (const g of groups) {
    while (g.lineIndex >= out.numLines) {
      out.lineAscents.push(0);
      out.lineDescents.push(0);
      out.lineHeights.push(0);
      out.lineLeadings.push(0);
      out.lineWidths.push(0);
      out.numLines++;
    }

    const li = g.lineIndex;
    out.lineAscents[li] = Math.max(out.lineAscents[li], g.ascent);
    out.lineDescents[li] = Math.max(out.lineDescents[li], g.descent);
    out.lineHeights[li] = Math.max(out.lineHeights[li], g.height);
    if (g.leading > out.lineLeadings[li]) out.lineLeadings[li] = g.leading;

    const rightEdge = g.offsetX - GUTTER + g.width;
    if (rightEdge > out.lineWidths[li]) out.lineWidths[li] = rightEdge;
    if (rightEdge > out.textWidth) out.textWidth = rightEdge;

    const bottom = Math.ceil(g.offsetY - GUTTER + g.ascent + g.descent);
    if (bottom > out.textHeight) out.textHeight = bottom;
  }

  if (out.numLines === 0) out.numLines = 1;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function layoutText(out: TextLayoutResult, params: TextLayoutParams): void {
  const {
    text,
    formatRanges,
    width,
    measure,
    wordWrap = false,
    multiline = false,
    autoSize = 'none',
    border = false,
  } = params;

  if (!text || formatRanges.length === 0) {
    out.groups.length = 0;
    out.lineAscents.length = 0;
    out.lineDescents.length = 0;
    out.lineHeights.length = 0;
    out.lineLeadings.length = 0;
    out.lineWidths.length = 0;
    out.numLines = 1;
    out.textHeight = 0;
    out.textWidth = 0;
    return;
  }

  getLineBreaks(_lineBreaks, text);
  buildGroups(out.groups, text, formatRanges, _lineBreaks, width, measure, wordWrap, multiline);
  writeLineMetrics(out, out.groups);

  // Alignment shifts require knowing per-line widths first.
  applyAlignment(out.groups, width, out.lineWidths);

  // autoSize is intentionally not applied here — callers (scene graph /
  // renderer) own the node's width/height and apply the result themselves.
  void autoSize;
  void border;
}
