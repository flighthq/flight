import type {
  TextDirection,
  TextFormat,
  TextFormatRange,
  TextJustification,
  TextLayoutGroup,
  TextLayoutParams,
  TextLayoutResult,
  TextMeasureFunction,
} from '@flighthq/types';
export type { TextLayoutParams, TextLayoutResult, TextMeasureFunction } from '@flighthq/types';

import { getTextFormatAscent, getTextFormatDescent, getTextFormatLeading, mergeTextFormat } from './textFormat';
import { createTextLayoutGroup } from './textLayoutGroup';
import { getTextLineBreaks } from './textLineBreaks';

/** Inner padding (px) between a text box edge and its content, applied on every side. */
export const TEXT_LAYOUT_GUTTER = 2;

const _lineBreaks: number[] = [];
const _charAdvances: number[] = [];
// Paragraph-final line indices collected by buildGroups, consumed by justifyLines.
// Lines at these indices must not be justified (CSS standard: last line of a paragraph is left).
const _paragraphLastLines: Set<number> = new Set();

export function computeTextLayout(out: TextLayoutResult, params: TextLayoutParams): void {
  const {
    text,
    formatRanges,
    width,
    measure,
    wordWrap = false,
    multiline = false,
    autoSize = 'none',
    border = false,
    direction = 'LeftToRight',
    justification = 'interWord',
    maxLines = -1,
    truncationCharacter = '…',
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

  getTextLineBreaks(_lineBreaks, text);
  _paragraphLastLines.clear();
  buildGroups(
    out.groups,
    _paragraphLastLines,
    text,
    formatRanges,
    _lineBreaks,
    width,
    measure,
    wordWrap,
    multiline,
    maxLines,
    truncationCharacter,
  );
  writeLineMetrics(out, out.groups);

  // Alignment shifts require knowing per-line widths first.
  applyAlignment(out.groups, width, out.lineWidths, direction, justification, _paragraphLastLines, text);

  // autoSize is intentionally not applied here — callers (scene graph /
  // renderer) own the node's width/height and apply the result themselves.
  void autoSize;
  void border;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function charAdvances(
  out: number[],
  text: string,
  format: TextFormat,
  start: number,
  end: number,
  measure: TextMeasureFunction,
  startX = 0,
): void {
  out.length = 0;
  const letterSpacing = format.letterSpacing ?? 0;
  const tabStops = format.tabStops;
  const kerningEnabled = format.kerning !== false;
  let currentX = startX;

  // Iterate codepoints so surrogate pairs (emoji, astral scripts) are not split.
  let i = start;
  while (i < end) {
    const cp = text.codePointAt(i) ?? 0;
    const charLen = cp > 0xffff ? 2 : 1;
    const char = text.slice(i, i + charLen);
    let advance: number;

    if (char === '\t') {
      advance = getTabAdvance(currentX, tabStops, measure, format);
      out.push(advance);
      currentX += advance;
      i += charLen;
      continue;
    }

    // Look ahead for the next codepoint to compute a kerned pair advance.
    const nextStart = i + charLen;
    if (kerningEnabled && nextStart < end && text.charCodeAt(nextStart) !== 9 /* \t */) {
      const nextCp = text.codePointAt(nextStart) ?? 0;
      const nextLen = nextCp > 0xffff ? 2 : 1;
      const nextChar = text.slice(nextStart, nextStart + nextLen);
      const nextW = measure(nextChar, format);
      const pairW = measure(char + nextChar, format);
      advance = pairW - nextW;
    } else {
      advance = measure(char, format);
    }
    out.push(advance + letterSpacing);
    currentX += advance + letterSpacing;
    i += charLen;
  }
}

function sumAdvances(positions: number[]): number {
  let total = 0;
  for (const p of positions) total += p;
  return total;
}

function getTabAdvance(
  currentX: number,
  tabStops: number[] | undefined,
  measure: TextMeasureFunction,
  format: TextFormat,
): number {
  if (tabStops != null && tabStops.length > 0) {
    for (const stop of tabStops) {
      if (stop > currentX) return stop - currentX;
    }
  }
  // Default: advance to next multiple of 4 spaces
  const spaceW = measure('    ', format) / 4;
  const tabW = Math.max(spaceW, 1) * 4;
  return tabW - (currentX % tabW);
}

// ---------------------------------------------------------------------------
// Layout group construction
// ---------------------------------------------------------------------------

function buildGroups(
  out: TextLayoutGroup[],
  paragraphLastLines: Set<number>,
  text: string,
  formatRanges: readonly TextFormatRange[],
  lineBreaks: number[],
  containerWidth: number,
  measure: TextMeasureFunction,
  wordWrap: boolean,
  multiline: boolean,
  maxLines: number,
  truncationCharacter: string,
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
  // Bullet: hanging-indent prefix for list items. Set when bullet format starts a paragraph.
  let bulletPending = false;
  const bulletChar = '•'; // •

  // Line-level metrics.
  let ascent = getTextFormatAscent(currentFormat);
  let descent = getTextFormatDescent(currentFormat);
  let leading = getTextFormatLeading(currentFormat);
  let lineHeight = Math.ceil(ascent + descent + leading);
  let maxAscent = ascent;
  let maxLineHeight = lineHeight;

  let textIndex = 0;
  let lineIndex = 0;
  let offsetX = 0;
  let offsetY = 0;

  // Track whether truncation has been applied to stop further placement.
  let truncated = false;

  let breakCount = 0;
  let breakIndex = lineBreaks.length > 0 ? lineBreaks[0] : -1;
  let spaceIndex = text.indexOf(' ');

  let activeGroup: TextLayoutGroup | null = null;

  // --- Local helpers that close over the mutable state above ---

  function baseX(): number {
    return TEXT_LAYOUT_GUTTER + leftMargin + blockIndent + (firstLineOfParagraph ? indent : 0);
  }

  function wrapWidth(): number {
    return containerWidth - TEXT_LAYOUT_GUTTER - rightMargin - baseX();
  }

  function updateLineMetrics(): void {
    ascent = getTextFormatAscent(currentFormat);
    descent = getTextFormatDescent(currentFormat);
    leading = getTextFormatLeading(currentFormat);
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
    // Detect bullet format at paragraph start.
    bulletPending = currentFormat.bullet === true;
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
    updateLineMetrics();
  }

  // Check whether maxLines has been reached. If so, append the truncation
  // character to the last visible line and mark truncated.
  // Must be called after commitLine(), so lineIndex points one past the last committed line.
  function checkTruncation(): boolean {
    if (maxLines < 0 || lineIndex < maxLines) return false;
    // The last committed line index is lineIndex - 1.
    const lastLineIndex = lineIndex - 1;
    // Append truncation character to last visible group on that line if it fits.
    if (truncationCharacter.length > 0 && groups.length > 0) {
      // Find the last group on the last committed line.
      let lastGroup: TextLayoutGroup | null = null;
      for (let i = groups.length - 1; i >= 0; i--) {
        if (groups[i].lineIndex === lastLineIndex) {
          lastGroup = groups[i];
          break;
        }
      }
      if (lastGroup !== null) {
        const ellipsisW = measure(truncationCharacter, lastGroup.format);
        const available = containerWidth - TEXT_LAYOUT_GUTTER - rightMargin - lastGroup.offsetX;
        // Trim characters from the end of the last group until the ellipsis fits.
        while (lastGroup.positions.length > 0) {
          const usedW = sumAdvances(lastGroup.positions);
          if (usedW + ellipsisW <= available) break;
          const trimmed = lastGroup.positions.pop() ?? 0;
          lastGroup.width -= trimmed;
          lastGroup.endIndex--;
          if (lastGroup.endIndex <= lastGroup.startIndex) break;
        }
        // Build a synthetic group for the ellipsis using the last group's format.
        const ellipsisGroup = createTextLayoutGroup(lastGroup.format, lastGroup.endIndex, lastGroup.endIndex);
        const ellipsisOffsetX = lastGroup.offsetX + lastGroup.width;
        ellipsisGroup.positions = [ellipsisW];
        ellipsisGroup.width = ellipsisW;
        ellipsisGroup.offsetX = ellipsisOffsetX;
        ellipsisGroup.ascent = lastGroup.ascent;
        ellipsisGroup.descent = lastGroup.descent;
        ellipsisGroup.leading = lastGroup.leading;
        ellipsisGroup.lineIndex = lastLineIndex;
        ellipsisGroup.offsetY = lastGroup.offsetY;
        ellipsisGroup.height = lastGroup.height;
        groups.push(ellipsisGroup);
      }
    }
    truncated = true;
    return true;
  }

  // Emit a bullet glyph at the start of a list-item paragraph.
  function emitBullet(): void {
    if (!bulletPending) return;
    bulletPending = false;
    // Respect listMarker: 'none' suppresses the glyph while keeping paragraph indent.
    if (currentFormat.listMarker === 'none') {
      if (indent <= 0) indent = Math.ceil(measure(bulletChar, currentFormat)) + 2;
      return;
    }
    const bulletW = measure(bulletChar, currentFormat);
    // Hanging-indent: the bullet occupies the indent area before the text margin.
    const bulletGroup = createTextLayoutGroup(currentFormat, textIndex, textIndex);
    bulletGroup.positions = [bulletW];
    bulletGroup.width = bulletW;
    // Position bullet in the indent area to the left of baseX.
    bulletGroup.offsetX = TEXT_LAYOUT_GUTTER + leftMargin + blockIndent;
    bulletGroup.ascent = ascent;
    bulletGroup.descent = descent;
    bulletGroup.leading = leading;
    bulletGroup.lineIndex = lineIndex;
    bulletGroup.offsetY = offsetY + TEXT_LAYOUT_GUTTER;
    bulletGroup.height = lineHeight;
    groups.push(bulletGroup);
    // An explicit positive indent set by the user always wins, even if it is
    // narrower than the bullet glyph (the text may then overlap the bullet) —
    // the user owns the hanging-indent width. Only when no indent is supplied
    // (indent <= 0) do we auto-compute one wide enough to clear the bullet.
    if (indent <= 0) {
      indent = Math.ceil(bulletW) + 2;
    }
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

        charAdvances(activeGroup.positions, text, currentFormat, idx, rangeEnd, measure, offsetX + baseX());
        const spanWidth = sumAdvances(activeGroup.positions);
        activeGroup.offsetX = offsetX + baseX();
        activeGroup.ascent = ascent;
        activeGroup.descent = descent;
        activeGroup.leading = leading;
        activeGroup.lineIndex = lineIndex;
        activeGroup.offsetY = offsetY + TEXT_LAYOUT_GUTTER;
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

    const savedRangeIndex = rangeIndex;
    const savedFormat = { ...currentFormat };
    const savedFormatRange = formatRange;

    let idx = start;
    const allPositions: number[] = [];

    while (idx < end) {
      const rangeEnd = Math.min(end, formatRange.end);
      if (idx < rangeEnd) {
        charAdvances(
          _charAdvances,
          text,
          currentFormat,
          idx,
          rangeEnd,
          measure,
          offsetX + baseX() + sumAdvances(allPositions),
        );
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
      if (truncated) return;
      charAdvances(_charAdvances, text, currentFormat, remaining, end, measure, offsetX + baseX());
      const totalW = sumAdvances(_charAdvances);

      if (offsetX + totalW <= wrapWidth()) {
        placeSpan(remaining, end);
        return;
      }

      // Find the largest prefix that fits, stepping by codepoint.
      let count = 0;
      let charCount = 0;
      let w = 0;
      let i = remaining;
      while (i < end && count < _charAdvances.length) {
        const cp = text.codePointAt(i) ?? 0;
        const cpLen = cp > 0xffff ? 2 : 1;
        if (offsetX + w + (_charAdvances[count] ?? 0) > wrapWidth()) break;
        w += _charAdvances[count] ?? 0;
        count++;
        charCount += cpLen;
        i += cpLen;
      }
      if (charCount === 0) {
        // Always place at least one codepoint.
        const cp = text.codePointAt(remaining) ?? 0;
        charCount = cp > 0xffff ? 2 : 1;
      }

      placeSpan(remaining, remaining + charCount);
      commitLine();
      if (checkTruncation()) return;
      remaining += charCount;
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  updateLineMetrics();
  updateParagraphMetrics();

  while (textIndex <= text.length) {
    if (truncated) break;

    // Emit pending bullet at the start of each list-item paragraph.
    emitBullet();

    const hasBreak = breakIndex !== -1;
    const breakBeforeSpace = hasBreak && (spaceIndex === -1 || breakIndex <= spaceIndex);

    if (breakBeforeSpace) {
      // Place text up to the line break character.
      if (textIndex <= breakIndex) {
        placeSpan(textIndex, breakIndex);
        activeGroup = null;
      }

      commitLine();
      // The just-committed line (lineIndex - 1) ends a paragraph — do not justify it.
      paragraphLastLines.add(lineIndex - 1);
      if (checkTruncation()) break;

      if (!multiline) break;

      textIndex = breakIndex + 1;
      breakCount++;
      breakIndex = breakCount < lineBreaks.length ? lineBreaks[breakCount] : -1;
      spaceIndex = text.indexOf(' ', textIndex);

      updateParagraphMetrics();
      updateLineMetrics();
    } else if (spaceIndex !== -1) {
      // Determine the segment to try placing: from textIndex to end of the
      // word that follows this space (i.e. including the space itself).
      const wordEnd = spaceIndex + 1;
      const segEnd = hasBreak && breakIndex < wordEnd ? breakIndex : wordEnd;

      const { positions: segPos, width: segWidth } = measureSpan(textIndex, segEnd);

      let shouldWrap = wordWrap && containerWidth >= TEXT_LAYOUT_GUTTER * 2 && offsetX + segWidth > wrapWidth();

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
        if (checkTruncation()) break;

        // Skip a leading space carried onto the newly wrapped line. Only an
        // actual space at textIndex is dropped: the space separating words is
        // placed as the trailing space of the previous word, so after a normal
        // wrap textIndex already points at the next word's first character and
        // must be kept — advancing unconditionally would consume that character.
        if (text.charCodeAt(textIndex) === 0x20) textIndex++;
      }

      placeSpan(textIndex, segEnd);
      spaceIndex = text.indexOf(' ', wordEnd);
    } else {
      // No more spaces or breaks — place the remainder of the text.
      if (textIndex >= text.length) break;

      if (wordWrap && containerWidth >= TEXT_LAYOUT_GUTTER * 2) {
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
  // The current lineIndex is always the last paragraph's final line (never justified).
  paragraphLastLines.add(lineIndex);
}

// ---------------------------------------------------------------------------
// Alignment pass
// ---------------------------------------------------------------------------

function applyAlignment(
  groups: TextLayoutGroup[],
  containerWidth: number,
  lineWidths: number[],
  direction: TextDirection,
  justification: TextJustification,
  paragraphLastLines: ReadonlySet<number>,
  text: string,
): void {
  for (const g of groups) {
    const lineW = lineWidths[g.lineIndex];
    const align = g.format.align ?? 'left';
    let shift = 0;

    // Resolve direction-relative aliases.
    const resolved =
      align === 'start'
        ? direction === 'RightToLeft'
          ? 'right'
          : 'left'
        : align === 'end'
          ? direction === 'RightToLeft'
            ? 'left'
            : 'right'
          : align;

    if (resolved === 'right') {
      shift = containerWidth - lineW - TEXT_LAYOUT_GUTTER * 2;
    } else if (resolved === 'center') {
      shift = (containerWidth - lineW - TEXT_LAYOUT_GUTTER * 2) / 2;
    } else if (resolved === 'justify' && justification !== 'none') {
      // Justify is applied per-line across groups on the same line; handled below.
    }

    if (shift !== 0) g.offsetX += shift;
  }

  // Inter-word justification pass: for each line where align === 'justify',
  // distribute residual width across inter-word spaces. The last line of each
  // paragraph (tracked in paragraphLastLines) is left-aligned per CSS standard.
  justifyLines(groups, containerWidth, lineWidths, justification, paragraphLastLines, text);
}

function justifyLines(
  groups: TextLayoutGroup[],
  containerWidth: number,
  lineWidths: number[],
  justification: TextJustification,
  paragraphLastLines: ReadonlySet<number>,
  text: string,
): void {
  if (justification === 'none') return;

  const lineCount = lineWidths.length;

  for (let li = 0; li < lineCount; li++) {
    if (paragraphLastLines.has(li)) continue;

    const lineGroups: TextLayoutGroup[] = [];
    for (const g of groups) {
      if (g.lineIndex === li && g.format.align === 'justify') lineGroups.push(g);
    }
    if (lineGroups.length === 0) continue;

    const lineW = lineWidths[li];
    const available = containerWidth - TEXT_LAYOUT_GUTTER * 2;
    const residual = available - lineW;
    if (residual <= 0) continue;

    if (justification === 'interCharacter') {
      let charCount = 0;
      for (const g of lineGroups) charCount += g.positions.length;
      const gapCount = Math.max(0, charCount - 1);
      if (gapCount === 0) continue;
      const extraPerGap = residual / gapCount;
      let accumulated = 0;
      const lastGroup = lineGroups[lineGroups.length - 1];
      for (const g of lineGroups) {
        g.offsetX += accumulated;
        let groupExtra = 0;
        const lastPos = g === lastGroup ? g.positions.length - 1 : g.positions.length;
        for (let ci = 0; ci < lastPos; ci++) {
          g.positions[ci] += extraPerGap;
          accumulated += extraPerGap;
          groupExtra += extraPerGap;
        }
        g.width += groupExtra;
      }
    } else {
      // interWord: count actual space characters across all groups on the line.
      let spaceCount = 0;
      for (const g of lineGroups) {
        for (let ci = 0; ci < g.positions.length; ci++) {
          if (text.charCodeAt(g.startIndex + ci) === 0x20) spaceCount++;
        }
      }
      if (spaceCount === 0) continue;

      const extraPerSpace = residual / spaceCount;
      let accumulated = 0;
      for (const g of lineGroups) {
        g.offsetX += accumulated;
        let groupExtra = 0;
        for (let ci = 0; ci < g.positions.length; ci++) {
          if (text.charCodeAt(g.startIndex + ci) === 0x20) {
            g.positions[ci] += extraPerSpace;
            accumulated += extraPerSpace;
            groupExtra += extraPerSpace;
          }
        }
        g.width += groupExtra;
      }
    }
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

    const rightEdge = g.offsetX - TEXT_LAYOUT_GUTTER + g.width;
    if (rightEdge > out.lineWidths[li]) out.lineWidths[li] = rightEdge;
    if (rightEdge > out.textWidth) out.textWidth = rightEdge;

    const bottom = Math.ceil(g.offsetY - TEXT_LAYOUT_GUTTER + g.ascent + g.descent);
    if (bottom > out.textHeight) out.textHeight = bottom;
  }

  if (out.numLines === 0) out.numLines = 1;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

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

export function isTextLayoutTruncated(layout: Readonly<TextLayoutResult>, params: Readonly<TextLayoutParams>): boolean {
  if (params.maxLines === undefined || params.maxLines < 0) return false;
  return layout.numLines >= params.maxLines && layout.groups.length > 0;
}
