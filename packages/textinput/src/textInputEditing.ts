import { invalidateNodeAppearance } from '@flighthq/node';
import { setRichTextScrollH, setRichTextScrollV } from '@flighthq/text';
import { getRichTextSelectionRectangles, TEXT_BOUNDS_GUTTER } from '@flighthq/textlayout';
import type {
  HandleTextInputKeyboardOptions,
  KeyboardEventData,
  ReplaceTextInputOptions,
  RichText,
  RichTextData,
  TextFormatRange,
  TextInputState,
  TextLayoutGroup,
  TextLayoutResult,
  TextSelectionRectangle,
} from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

import { getTextInputState } from './textInput';

// Horizontal navigation resets the desired-x column so the next vertical motion anchors to the new
// caret position. Vertical navigation reads (and on first use, sets) desiredCaretX.
const DESIRED_CARET_X_UNSET = -1;

export function appendTextInput(source: RichText, text: string): void {
  replaceTextInput(source, source.data.text.length, source.data.text.length, text);
}

export function applyTextInputRestriction(source: Readonly<RichText>, text: string, replaceLength = 0): string {
  const data = source.data;
  let value = text;
  if (!data.multiline) value = value.replace(/[\n\r]+/g, '');
  value = restrictTextInput(value, getInputState(source).restrict);

  if (data.maxChars > 0) {
    const maxLength = data.maxChars - data.text.length + replaceLength;
    if (maxLength <= 0) return '';
    if (value.length > maxLength) value = value.slice(0, maxLength);
  }

  return value;
}

// Returns true if there is an edit record available to redo (i.e. the history cursor is not at the
// most-recent record).
export function canRedoTextInput(source: Readonly<RichText>): boolean {
  const state = getInputState(source);
  return state.historyIndex < state.history.length - 1;
}

// Returns true if there is an edit record available to undo (i.e. at least one edit has been recorded
// and the history cursor is not before the first record).
export function canUndoTextInput(source: Readonly<RichText>): boolean {
  return getInputState(source).historyIndex >= 0;
}

// Clears the undo/redo history for this field. Does not change the text or selection.
export function clearTextInputHistory(source: RichText): void {
  const state = getInputState(source);
  state.history = [];
  state.historyIndex = -1;
}

export function deleteTextInputBackward(source: RichText): void {
  const state = getInputState(source);
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start, end, '');
  } else if (start > 0) {
    replaceTextInput(source, start - 1, start, '');
  }
  state.selectionIndex = state.caretIndex;
}

export function deleteTextInputForward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start, end, '');
  } else if (start < source.data.text.length) {
    replaceTextInput(source, start, start + 1, '');
  }
}

// Deletes backward by one word — from the caret position to the beginning of the previous word
// (or the beginning of the text if no word boundary precedes the caret). If a range is selected,
// deletes the selection instead, matching typical Ctrl/Alt+Backspace behavior.
export function deleteTextInputWordBackward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start, end, '');
    return;
  }
  const wordStart = findWordStartBefore(source.data.text, start);
  if (wordStart < start) replaceTextInput(source, wordStart, start, '');
}

// Deletes forward by one word — from the caret position to the end of the next word
// (or the end of the text if no word boundary follows the caret). If a range is selected,
// deletes the selection instead, matching typical Ctrl/Alt+Delete behavior.
export function deleteTextInputWordForward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start, end, '');
    return;
  }
  const wordEnd = findWordEndAfter(source.data.text, start);
  if (wordEnd > start) replaceTextInput(source, start, wordEnd, '');
}

export function getTextInputCaretIndex(source: Readonly<RichText>): number {
  return clampIndex(getInputState(source).caretIndex, source.data.text.length);
}

export function getTextInputCaretRectangle(
  out: TextSelectionRectangle,
  source: Readonly<RichText>,
  layout: Readonly<TextLayoutResult>,
): void {
  const caretIndex = getTextInputCaretIndex(source);
  const group = getTextLayoutGroupAtIndex(layout, caretIndex);
  if (group === null) {
    out.x = TEXT_BOUNDS_GUTTER;
    out.y = TEXT_BOUNDS_GUTTER;
    out.width = 1;
    out.height = getFallbackLineHeight(layout);
    out.lineIndex = 0;
    return;
  }

  out.x = getTextLayoutGroupCaretX(group, caretIndex);
  out.y = group.offsetY;
  out.width = 1;
  out.height = group.height;
  out.lineIndex = group.lineIndex;
}

export function getTextInputCharacterIndexAtPoint(
  source: Readonly<RichText>,
  layout: Readonly<TextLayoutResult>,
  x: number,
  y: number,
): number {
  if (layout.groups.length === 0) return 0;

  let closestLineIndex = 0;
  let closestLineDistance = Infinity;
  for (let i = 0; i < layout.lineHeights.length; i++) {
    const lineTop = getLineOffsetY(layout, i);
    const lineBottom = lineTop + layout.lineHeights[i];
    const distance = y < lineTop ? lineTop - y : y > lineBottom ? y - lineBottom : 0;
    if (distance < closestLineDistance) {
      closestLineDistance = distance;
      closestLineIndex = i;
    }
  }

  let lineStart = source.data.text.length;
  let lineEnd = 0;
  for (const group of layout.groups) {
    if (group.lineIndex !== closestLineIndex) continue;
    lineStart = Math.min(lineStart, group.startIndex);
    lineEnd = Math.max(lineEnd, group.endIndex);
    if (x <= group.offsetX) return group.startIndex;
    if (x <= group.offsetX + group.width) return getTextLayoutGroupCharacterIndexAtX(group, x);
  }

  return lineEnd > 0 ? lineEnd : lineStart;
}

export function getTextInputDisplayText(source: Readonly<RichText>): string {
  const state = getInputState(source);
  if (!state.displayAsPassword) return source.data.text;
  const passwordCharacter = state.passwordCharacter.length > 0 ? state.passwordCharacter.charAt(0) : '•';
  return passwordCharacter.repeat(source.data.text.length);
}

export function getTextInputSelectionBeginIndex(source: Readonly<RichText>): number {
  const state = getInputState(source);
  return Math.min(
    clampIndex(state.caretIndex, source.data.text.length),
    clampIndex(state.selectionIndex, source.data.text.length),
  );
}

export function getTextInputSelectionEndIndex(source: Readonly<RichText>): number {
  const state = getInputState(source);
  return Math.max(
    clampIndex(state.caretIndex, source.data.text.length),
    clampIndex(state.selectionIndex, source.data.text.length),
  );
}

export function getTextInputSelectionRectangles(
  out: TextSelectionRectangle[],
  source: Readonly<RichText>,
  layout: Readonly<TextLayoutResult>,
): void {
  getRichTextSelectionRectangles(
    out,
    getTextInputSelectionBeginIndex(source),
    getTextInputSelectionEndIndex(source),
    layout,
  );
}

export function getTextInputSelectionText(source: Readonly<RichText>): string {
  return source.data.text.slice(getTextInputSelectionBeginIndex(source), getTextInputSelectionEndIndex(source));
}

export function handleTextInputKeyboard(
  source: RichText,
  data: Readonly<KeyboardEventData>,
  options?: Readonly<HandleTextInputKeyboardOptions>,
): boolean {
  const command = getKeyboardCommand(data);
  if (command === 'none') return false;

  switch (command) {
    case 'backspace':
      deleteTextInputBackward(source);
      return true;
    case 'copy': {
      const copyText = getTextInputSelectionText(source);
      if (copyText.length > 0) options?.onCopy?.(copyText);
      return true;
    }
    case 'cut': {
      const cutText = getTextInputSelectionText(source);
      if (cutText.length > 0) {
        options?.onCopy?.(cutText);
        replaceSelectedTextInput(source, '');
      }
      return true;
    }
    case 'delete':
      deleteTextInputForward(source);
      return true;
    case 'deleteWordBackward':
      deleteTextInputWordBackward(source);
      return true;
    case 'deleteWordForward':
      deleteTextInputWordForward(source);
      return true;
    case 'documentEnd':
      moveTextInputCaret(source, source.data.text.length, data.shiftKey);
      return true;
    case 'documentStart':
      moveTextInputCaret(source, 0, data.shiftKey);
      return true;
    case 'down':
      moveTextInputCaretDown(source, options?.layout, data.shiftKey);
      return true;
    case 'end':
      moveTextInputCaretToLineEnd(source, options?.layout, data.shiftKey);
      return true;
    case 'home':
      moveTextInputCaretToLineStart(source, options?.layout, data.shiftKey);
      return true;
    case 'left':
      moveTextInputCaret(source, getTextInputCaretIndex(source) - 1, data.shiftKey);
      return true;
    case 'paste':
      insertTextInput(source, options?.clipboardText ?? '');
      return true;
    case 'return':
      if (!source.data.multiline) return false;
      insertTextInput(source, '\n');
      return true;
    case 'right':
      moveTextInputCaret(source, getTextInputCaretIndex(source) + 1, data.shiftKey);
      return true;
    case 'selectAll':
      selectAllTextInput(source);
      return true;
    case 'up':
      moveTextInputCaretUp(source, options?.layout, data.shiftKey);
      return true;
    case 'wordLeft':
      moveTextInputCaretByWord(source, -1, data.shiftKey);
      return true;
    case 'wordRight':
      moveTextInputCaretByWord(source, 1, data.shiftKey);
      return true;
  }
}

export function insertTextInput(source: RichText, text: string): void {
  replaceSelectedTextInput(source, text, { applyInputRules: true });
}

export function moveTextInputCaret(source: RichText, index: number, extendSelection = false): void {
  const caret = clampIndex(index, source.data.text.length);
  const state = getInputState(source);
  state.caretIndex = caret;
  if (!extendSelection) state.selectionIndex = caret;
  // Horizontal motion resets the desired-x column so subsequent vertical navigation re-anchors.
  state.desiredCaretX = DESIRED_CARET_X_UNSET;
  invalidateNodeAppearance(source);
}

// Moves the caret by one word in the given direction (negative = backward/left, positive = forward/right).
// Reuses the isWordChar boundary logic from word selection. When extendSelection is false, the anchor
// collapses to the new caret position; when true, the anchor stays and the selection extends.
export function moveTextInputCaretByWord(source: RichText, direction: number, extendSelection = false): void {
  const caretIndex = getTextInputCaretIndex(source);
  const text = source.data.text;
  let target: number;
  if (direction < 0) {
    target = findWordStartBefore(text, caretIndex);
  } else {
    target = findWordEndAfter(text, caretIndex);
  }
  moveTextInputCaret(source, target, extendSelection);
}

// Moves the caret down one line, preserving the desired-x column for continuous vertical navigation.
// Requires the current layout to resolve the target character index. When layout is absent, falls back
// to moving to the end of the text (matching the "no layout" degenerate case).
export function moveTextInputCaretDown(
  source: RichText,
  layout: Readonly<TextLayoutResult> | null | undefined,
  extendSelection = false,
): void {
  if (layout === null || layout === undefined) {
    moveTextInputCaret(source, source.data.text.length, extendSelection);
    return;
  }
  const state = getInputState(source);
  const out = scratchRect;
  getTextInputCaretRectangle(out, source, layout);
  if (state.desiredCaretX === DESIRED_CARET_X_UNSET) state.desiredCaretX = out.x;
  const targetLineIndex = out.lineIndex + 1;
  if (targetLineIndex >= layout.numLines) {
    moveTextInputCaret(source, source.data.text.length, extendSelection);
    return;
  }
  const targetY = getLineOffsetY(layout, targetLineIndex) + layout.lineHeights[targetLineIndex]! / 2;
  const targetIndex = getTextInputCharacterIndexAtPoint(source, layout, state.desiredCaretX, targetY);
  const newCaret = clampIndex(targetIndex, source.data.text.length);
  state.caretIndex = newCaret;
  if (!extendSelection) state.selectionIndex = newCaret;
  // Preserve desiredCaretX across vertical steps (do not reset it).
  invalidateNodeAppearance(source);
}

// Moves the caret to the end of the current line using layout. Falls back to the end of the text
// when layout is absent. In single-line fields "current line" is always the only line.
export function moveTextInputCaretToLineEnd(
  source: RichText,
  layout: Readonly<TextLayoutResult> | null | undefined,
  extendSelection = false,
): void {
  if (layout === null || layout === undefined) {
    moveTextInputCaret(source, source.data.text.length, extendSelection);
    return;
  }
  const lineIndex = getCaretLineIndex(source, layout);
  const lineEnd = getLineEndIndex(layout, lineIndex, source.data.text.length);
  moveTextInputCaret(source, lineEnd, extendSelection);
}

// Moves the caret to the start of the current line using layout. Falls back to the start of the
// text when layout is absent. In single-line fields "current line" is always the only line.
export function moveTextInputCaretToLineStart(
  source: RichText,
  layout: Readonly<TextLayoutResult> | null | undefined,
  extendSelection = false,
): void {
  if (layout === null || layout === undefined) {
    moveTextInputCaret(source, 0, extendSelection);
    return;
  }
  const lineIndex = getCaretLineIndex(source, layout);
  const lineStart = getLineStartIndex(layout, lineIndex);
  moveTextInputCaret(source, lineStart, extendSelection);
}

// Moves the caret up one line, preserving the desired-x column for continuous vertical navigation.
// Requires the current layout to resolve the target character index. When layout is absent, falls back
// to moving to the beginning of the text.
export function moveTextInputCaretUp(
  source: RichText,
  layout: Readonly<TextLayoutResult> | null | undefined,
  extendSelection = false,
): void {
  if (layout === null || layout === undefined) {
    moveTextInputCaret(source, 0, extendSelection);
    return;
  }
  const state = getInputState(source);
  const out = scratchRect;
  getTextInputCaretRectangle(out, source, layout);
  if (state.desiredCaretX === DESIRED_CARET_X_UNSET) state.desiredCaretX = out.x;
  const targetLineIndex = out.lineIndex - 1;
  if (targetLineIndex < 0) {
    moveTextInputCaret(source, 0, extendSelection);
    return;
  }
  const targetY = getLineOffsetY(layout, targetLineIndex) + layout.lineHeights[targetLineIndex]! / 2;
  const targetIndex = getTextInputCharacterIndexAtPoint(source, layout, state.desiredCaretX, targetY);
  const newCaret = clampIndex(targetIndex, source.data.text.length);
  state.caretIndex = newCaret;
  if (!extendSelection) state.selectionIndex = newCaret;
  // Preserve desiredCaretX across vertical steps (do not reset it).
  invalidateNodeAppearance(source);
}

// Reapplies the next edit record in the history, moving the history cursor forward.
// Does nothing when there is nothing to redo (canRedoTextInput is false).
export function redoTextInput(source: RichText): void {
  const state = getInputState(source);
  if (!canRedoTextInput(source)) return;
  state.historyIndex++;
  const record = state.history[state.historyIndex]!;
  applyHistoryRecord(source, state, record.textAfter, record.caretIndexAfter, record.selectionIndexAfter);
}

export function replaceSelectedTextInput(
  source: RichText,
  text: string,
  options?: Readonly<ReplaceTextInputOptions>,
): void {
  replaceTextInput(
    source,
    getTextInputSelectionBeginIndex(source),
    getTextInputSelectionEndIndex(source),
    text,
    options,
  );
}

export function replaceTextInput(
  source: RichText,
  beginIndex: number,
  endIndex: number,
  text: string,
  options?: Readonly<ReplaceTextInputOptions>,
): void {
  const data = source.data;
  let start = clampIndex(beginIndex, data.text.length);
  let end = clampIndex(endIndex, data.text.length);
  if (end < start) {
    const swap = start;
    start = end;
    end = swap;
  }

  const value = options?.applyInputRules === true ? applyTextInputRestriction(source, text, end - start) : text;
  if (value.length === 0 && start === end) return;

  const state = getInputState(source);
  const textBefore = data.text;
  const caretBefore = clampIndex(state.caretIndex, textBefore.length);
  const selectionBefore = clampIndex(state.selectionIndex, textBefore.length);

  data.text = textBefore.slice(0, start) + value + textBefore.slice(end);
  adjustTextFormatRanges(data.textFormatRanges, data.defaultTextFormat, start, end, value.length);
  // An edit changes the caret position, so any stored desired-x column is no longer valid.
  state.desiredCaretX = DESIRED_CARET_X_UNSET;
  setTextInputSelection(source, start + value.length, start + value.length);

  if (options?.skipHistory !== true && state.historyLimit > 0) {
    recordTextInputEdit(state, textBefore, data.text, caretBefore, selectionBefore, options?.mergeKind ?? null);
  }

  invalidateNodeAppearance(source);
}

// Scrolls the text field so the caret is visible within the given viewport dimensions. Uses the
// field's layout to locate the caret rectangle, then adjusts scrollV (vertical) and scrollH
// (horizontal) as needed to bring the caret into the visible region with a small margin.
// Pass the layout used to render this field and the display dimensions of the field's visible area.
export function scrollTextInputCaretIntoView(
  source: RichText,
  layout: Readonly<TextLayoutResult>,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const out = scratchRect;
  getTextInputCaretRectangle(out, source, layout);

  // Vertical scroll (line-based: scrollV is 1-based line number).
  const caretTop = out.y;
  const caretBottom = out.y + out.height;
  // Compute the pixel offset of the current scrollV (0-based line index = scrollV - 1).
  const scrollVLine = (source.data.scrollV ?? 1) - 1;
  let viewTop = 0;
  for (let i = 0; i < scrollVLine; i++) viewTop += layout.lineHeights[i] ?? 0;
  const viewBottom = viewTop + viewportHeight;

  if (caretTop < viewTop) {
    // Caret is above the viewport: find the line that contains the caret and scroll to it.
    setRichTextScrollV(source, out.lineIndex + 1, layout);
  } else if (caretBottom > viewBottom) {
    // Caret is below the viewport: scroll down so the caret line is at the bottom.
    let pixelOffset = 0;
    let firstVisibleLine = 0;
    for (let i = 0; i < layout.numLines; i++) {
      if (pixelOffset + layout.lineHeights[i]! > caretBottom - viewportHeight) {
        firstVisibleLine = i;
        break;
      }
      pixelOffset += layout.lineHeights[i]!;
    }
    setRichTextScrollV(source, firstVisibleLine + 1, layout);
  }

  // Horizontal scroll (pixel-based). Add a small margin so the caret is not right at the edge.
  const CARET_SCROLL_MARGIN = 8;
  const scrollH = source.data.scrollH ?? 0;
  const caretLeft = out.x - scrollH;
  const caretRight = caretLeft + out.width;
  if (caretLeft < 0) {
    setRichTextScrollH(source, Math.max(0, out.x - CARET_SCROLL_MARGIN), layout);
  } else if (caretRight + CARET_SCROLL_MARGIN > viewportWidth) {
    setRichTextScrollH(source, out.x + out.width + CARET_SCROLL_MARGIN - viewportWidth, layout);
  }
}

export function selectAllTextInput(source: RichText): void {
  setTextInputSelection(source, 0, source.data.text.length);
}

export function selectLineAtTextInputIndex(source: RichText, index: number): void {
  const text = source.data.text;
  const clamped = Math.max(0, Math.min(text.length, index));
  let start = clamped;
  let end = clamped;
  while (start > 0 && text.charAt(start - 1) !== '\n') start--;
  while (end < text.length && text.charAt(end) !== '\n') end++;
  setTextInputSelection(source, start, end);
}

export function selectWordAtTextInputIndex(source: RichText, index: number): void {
  const text = source.data.text;
  const clamped = Math.max(0, Math.min(text.length, index));
  let start = clamped;
  let end = clamped;
  while (start > 0 && isWordChar(text.charAt(start - 1))) start--;
  while (end < text.length && isWordChar(text.charAt(end))) end++;
  if (start === end) {
    while (start > 0 && !isWordChar(text.charAt(start - 1))) start--;
    while (end < text.length && !isWordChar(text.charAt(end))) end++;
  }
  setTextInputSelection(source, start, end);
}

export function setTextInputSelection(source: RichText, beginIndex: number, endIndex: number): void {
  const state = getInputState(source);
  state.selectionIndex = clampIndex(beginIndex, source.data.text.length);
  state.caretIndex = clampIndex(endIndex, source.data.text.length);
  invalidateNodeAppearance(source);
}

// Restores the most-recent edit, moving the history cursor backward.
// Does nothing when there is nothing to undo (canUndoTextInput is false).
export function undoTextInput(source: RichText): void {
  const state = getInputState(source);
  if (!canUndoTextInput(source)) return;
  const record = state.history[state.historyIndex]!;
  state.historyIndex--;
  applyHistoryRecord(source, state, record.textBefore, record.caretIndexBefore, record.selectionIndexBefore);
}

function adjustTextFormatRanges(
  ranges: TextFormatRange[],
  defaultFormat: RichTextData['defaultTextFormat'],
  beginIndex: number,
  endIndex: number,
  insertLength: number,
): void {
  const removeLength = endIndex - beginIndex;
  const offset = insertLength - removeLength;

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];

    if (beginIndex === endIndex) {
      if (range.end < beginIndex) {
        continue;
      } else if (range.start >= beginIndex) {
        range.start += offset;
        range.end += offset;
      } else if (range.start < beginIndex && range.end >= beginIndex) {
        range.end += offset;
      }
    } else if (range.end <= beginIndex) {
      continue;
    } else if (range.start > endIndex) {
      range.start += offset;
      range.end += offset;
    } else if (range.start <= beginIndex && range.end > endIndex) {
      range.end += offset;
    } else if (range.start >= beginIndex && range.end <= endIndex) {
      ranges.splice(i--, 1);
    } else if (range.end > endIndex && range.start > beginIndex && range.start <= endIndex) {
      range.start = beginIndex;
      range.end += offset;
    } else if (range.start < beginIndex && range.end > beginIndex && range.end <= endIndex) {
      range.end = beginIndex;
    }
  }

  for (let i = ranges.length - 1; i >= 0; i--) {
    if (ranges[i].start >= ranges[i].end) ranges.splice(i, 1);
  }
  if (ranges.length === 0 && insertLength > 0) {
    ranges.push({ end: beginIndex + insertLength, format: { ...defaultFormat }, start: beginIndex });
  }
}

// Restores a recorded text/caret/selection snapshot onto the field. Used by undoTextInput and
// redoTextInput, which only differ in which side of the record (before/after) they restore.
// Sets the text directly without recording a new history entry, resets desiredCaretX, and invalidates.
function applyHistoryRecord(
  source: RichText,
  state: TextInputState,
  text: string,
  caretIndex: number,
  selectionIndex: number,
): void {
  source.data.text = text;
  state.caretIndex = clampIndex(caretIndex, text.length);
  state.selectionIndex = clampIndex(selectionIndex, text.length);
  state.desiredCaretX = DESIRED_CARET_X_UNSET;
  invalidateNodeAppearance(source);
}

function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.trunc(value)));
}

// Returns the layout line index that the caret currently sits on. Reads the caret rectangle (which
// resolves the caret's layout group) and returns its lineIndex. Falls back to 0 for an empty layout.
function getCaretLineIndex(source: Readonly<RichText>, layout: Readonly<TextLayoutResult>): number {
  const out = scratchRect;
  getTextInputCaretRectangle(out, source, layout);
  return out.lineIndex;
}

function getFallbackLineHeight(layout: Readonly<TextLayoutResult>): number {
  return layout.lineHeights[0] ?? 12;
}

// Editing operates on the editable-input slot enableTextInput attaches; calling an editing function on
// a RichText that never enabled input is API misuse, so this throws rather than returning a sentinel.
function getInputState(source: Readonly<RichText>): TextInputState {
  const state = getTextInputState(source);
  if (state === null) throw new Error('text input is not enabled on this RichText; call enableTextInput first');
  return state;
}

function getKeyboardCommand(data: Readonly<KeyboardEventData>): KeyboardCommand {
  if (data.ctrlKey || data.metaKey) {
    const key = data.key.toLowerCase();
    if (key === 'a' || data.keyCode === KeyCode.A) return 'selectAll';
    if (key === 'c' || data.keyCode === KeyCode.C) return 'copy';
    if (key === 'v' || data.keyCode === KeyCode.V) return 'paste';
    if (key === 'x' || data.keyCode === KeyCode.X) return 'cut';
    // Word-motion: Ctrl+Left / Ctrl+Right (Windows/Linux); Alt+Left / Alt+Right handled via altKey below.
    if (data.keyCode === KeyCode.LEFT || data.key === 'ArrowLeft') return 'wordLeft';
    if (data.keyCode === KeyCode.RIGHT || data.key === 'ArrowRight') return 'wordRight';
    // Word-delete: Ctrl+Backspace / Ctrl+Delete.
    if (data.keyCode === KeyCode.BACKSPACE || data.key === 'Backspace') return 'deleteWordBackward';
    if (data.keyCode === KeyCode.DELETE || data.key === 'Delete') return 'deleteWordForward';
    // Document-level Home/End: Ctrl+Home / Ctrl+End (Windows/Linux), Cmd+Home / Cmd+End (macOS).
    if (data.keyCode === KeyCode.HOME || data.key === 'Home') return 'documentStart';
    if (data.keyCode === KeyCode.END || data.key === 'End') return 'documentEnd';
    return 'none';
  }
  // Alt+Left / Alt+Right: word motion on macOS.
  if (data.altKey) {
    if (data.keyCode === KeyCode.LEFT || data.key === 'ArrowLeft') return 'wordLeft';
    if (data.keyCode === KeyCode.RIGHT || data.key === 'ArrowRight') return 'wordRight';
    if (data.keyCode === KeyCode.BACKSPACE || data.key === 'Backspace') return 'deleteWordBackward';
    if (data.keyCode === KeyCode.DELETE || data.key === 'Delete') return 'deleteWordForward';
  }
  if (data.keyCode === KeyCode.BACKSPACE || data.key === 'Backspace') return 'backspace';
  if (data.keyCode === KeyCode.DELETE || data.key === 'Delete') return 'delete';
  if (data.keyCode === KeyCode.DOWN || data.key === 'ArrowDown') return 'down';
  if (data.keyCode === KeyCode.END || data.key === 'End') return 'end';
  if (data.keyCode === KeyCode.HOME || data.key === 'Home') return 'home';
  if (data.keyCode === KeyCode.LEFT || data.key === 'ArrowLeft') return 'left';
  if (data.keyCode === KeyCode.RETURN || data.key === 'Enter') return 'return';
  if (data.keyCode === KeyCode.RIGHT || data.key === 'ArrowRight') return 'right';
  if (data.keyCode === KeyCode.UP || data.key === 'ArrowUp') return 'up';
  return 'none';
}

// Returns the character index at the end of the given layout line — the largest endIndex among the
// line's groups. Falls back to textLength when the line has no groups (e.g. a trailing empty line).
function getLineEndIndex(layout: Readonly<TextLayoutResult>, lineIndex: number, textLength: number): number {
  let end = -1;
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex && group.endIndex > end) end = group.endIndex;
  }
  return end < 0 ? textLength : end;
}

function getLineOffsetY(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) return group.offsetY;
  }
  let y = TEXT_BOUNDS_GUTTER;
  for (let i = 0; i < lineIndex; i++) y += layout.lineHeights[i] ?? 0;
  return y;
}

// Returns the character index at the start of the given layout line — the smallest startIndex among
// the line's groups. Falls back to 0 when the line has no groups.
function getLineStartIndex(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  let start = -1;
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex && (start < 0 || group.startIndex < start)) start = group.startIndex;
  }
  return start < 0 ? 0 : start;
}

function getTextLayoutGroupAtIndex(
  layout: Readonly<TextLayoutResult>,
  index: number,
): Readonly<TextLayoutGroup> | null {
  for (const group of layout.groups) {
    if (index >= group.startIndex && index <= group.endIndex) return group;
  }
  return layout.groups[layout.groups.length - 1] ?? null;
}

function getTextLayoutGroupCaretX(group: Readonly<TextLayoutGroup>, index: number): number {
  let x = group.offsetX;
  const limit = Math.max(0, Math.min(index, group.endIndex) - group.startIndex);
  for (let i = 0; i < limit; i++) x += group.positions[i] ?? 0;
  return x;
}

function getTextLayoutGroupCharacterIndexAtX(group: Readonly<TextLayoutGroup>, x: number): number {
  let currentX = group.offsetX;
  for (let i = 0; i < group.positions.length; i++) {
    const advance = group.positions[i] ?? 0;
    if (x < currentX + advance / 2) return group.startIndex + i;
    currentX += advance;
  }
  return group.endIndex;
}

// Appends an edit record to the history. When the new edit shares a non-null mergeKind with the record
// the cursor currently points at, the two are coalesced (before from the existing record, after from
// the new one) so a run of same-kind keystrokes collapses into a single undo step. Any records ahead of
// the cursor (the redo tail) are discarded first, and the history is trimmed to historyLimit.
function recordTextInputEdit(
  state: TextInputState,
  textBefore: string,
  textAfter: string,
  caretIndexBefore: number,
  selectionIndexBefore: number,
  mergeKind: string | null,
): void {
  // Drop any redo tail: a fresh edit makes the previously-undone records unreachable.
  if (state.historyIndex < state.history.length - 1) {
    state.history.length = state.historyIndex + 1;
  }

  const previous = state.historyIndex >= 0 ? state.history[state.historyIndex] : undefined;
  if (previous !== undefined && mergeKind !== null && previous.mergeKind === mergeKind) {
    previous.textAfter = textAfter;
    previous.caretIndexAfter = state.caretIndex;
    previous.selectionIndexAfter = state.selectionIndex;
    return;
  }

  state.history.push({
    caretIndexAfter: state.caretIndex,
    caretIndexBefore,
    mergeKind,
    selectionIndexAfter: state.selectionIndex,
    selectionIndexBefore,
    textAfter,
    textBefore,
  });
  state.historyIndex = state.history.length - 1;

  // Trim the oldest records past the limit, keeping the cursor pointed at the newest record.
  if (state.history.length > state.historyLimit) {
    const overflow = state.history.length - state.historyLimit;
    state.history.splice(0, overflow);
    state.historyIndex = state.history.length - 1;
  }
}

function restrictTextInput(text: string, restrict: string): string {
  if (restrict.length === 0 || text.length === 0) return text;

  const { accepted, declined } = splitRestrictRanges(restrict);
  let out = '';
  for (const char of text) {
    const acceptedMatch = accepted === '' || matchesRestrictRanges(char, accepted);
    const declinedMatch = declined !== '' && matchesRestrictRanges(char, declined);
    if (acceptedMatch && !declinedMatch) out += char;
  }
  return out;
}

function matchesRestrictRanges(char: string, ranges: string): boolean {
  for (let i = 0; i < ranges.length; i++) {
    const current = ranges.charAt(i);
    if (current === '\\' && i + 1 < ranges.length) {
      if (char === ranges.charAt(i + 1)) return true;
      i++;
    } else if (i + 2 < ranges.length && ranges.charAt(i + 1) === '-') {
      const end = ranges.charAt(i + 2);
      const code = char.charCodeAt(0);
      if (code >= current.charCodeAt(0) && code <= end.charCodeAt(0)) return true;
      i += 2;
    } else if (char === current) {
      return true;
    }
  }
  return false;
}

function splitRestrictRanges(restrict: string): { accepted: string; declined: string } {
  let accepted = '';
  let declined = '';
  let declining = false;

  for (let i = 0; i < restrict.length; i++) {
    const char = restrict.charAt(i);
    if (char === '\\' && i + 1 < restrict.length) {
      const escaped = char + restrict.charAt(i + 1);
      if (declining) declined += escaped;
      else accepted += escaped;
      i++;
    } else if (char === '^') {
      declining = !declining;
    } else if (declining) {
      declined += char;
    } else {
      accepted += char;
    }
  }

  return { accepted, declined };
}

type KeyboardCommand =
  | 'backspace'
  | 'copy'
  | 'cut'
  | 'delete'
  | 'deleteWordBackward'
  | 'deleteWordForward'
  | 'documentEnd'
  | 'documentStart'
  | 'down'
  | 'end'
  | 'home'
  | 'left'
  | 'none'
  | 'paste'
  | 'return'
  | 'right'
  | 'selectAll'
  | 'up'
  | 'wordLeft'
  | 'wordRight';

// Returns the index of the start of the word preceding `index` in `text`. Skips non-word chars first
// (to step out of whitespace/punctuation), then scans backward through word chars. Returns 0 if
// already at the beginning.
function findWordStartBefore(text: string, index: number): number {
  let i = index;
  while (i > 0 && !isWordChar(text.charAt(i - 1))) i--;
  while (i > 0 && isWordChar(text.charAt(i - 1))) i--;
  return i;
}

// Returns the index of the end of the word following `index` in `text`. Skips non-word chars first,
// then scans forward through word chars. Returns text.length if already at the end.
function findWordEndAfter(text: string, index: number): number {
  let i = index;
  while (i < text.length && !isWordChar(text.charAt(i))) i++;
  while (i < text.length && isWordChar(text.charAt(i))) i++;
  return i;
}

function isWordChar(char: string): boolean {
  return /\w/.test(char);
}

// TEXT_BOUNDS_GUTTER is imported from '@flighthq/textlayout' above.

// Scratch rectangle reused by vertical navigation to avoid allocating on every keystroke.
const scratchRect: { height: number; lineIndex: number; width: number; x: number; y: number } = {
  height: 0,
  lineIndex: 0,
  width: 0,
  x: 0,
  y: 0,
};
