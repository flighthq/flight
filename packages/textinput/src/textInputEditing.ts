import { invalidateNodeAppearance } from '@flighthq/node';
import { getRichTextSelectionRectangles } from '@flighthq/textlayout';
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
    case 'end':
      moveTextInputCaret(source, source.data.text.length, data.shiftKey);
      return true;
    case 'home':
      moveTextInputCaret(source, 0, data.shiftKey);
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
  invalidateNodeAppearance(source);
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

  data.text = data.text.slice(0, start) + value + data.text.slice(end);
  adjustTextFormatRanges(data.textFormatRanges, data.defaultTextFormat, start, end, value.length);
  setTextInputSelection(source, start + value.length, start + value.length);
  invalidateNodeAppearance(source);
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

function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.trunc(value)));
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
    return 'none';
  }
  if (data.keyCode === KeyCode.BACKSPACE || data.key === 'Backspace') return 'backspace';
  if (data.keyCode === KeyCode.DELETE || data.key === 'Delete') return 'delete';
  if (data.keyCode === KeyCode.END || data.key === 'End') return 'end';
  if (data.keyCode === KeyCode.HOME || data.key === 'Home') return 'home';
  if (data.keyCode === KeyCode.LEFT || data.key === 'ArrowLeft') return 'left';
  if (data.keyCode === KeyCode.RETURN || data.key === 'Enter') return 'return';
  if (data.keyCode === KeyCode.RIGHT || data.key === 'ArrowRight') return 'right';
  return 'none';
}

function getLineOffsetY(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) return group.offsetY;
  }
  let y = TEXT_BOUNDS_GUTTER;
  for (let i = 0; i < lineIndex; i++) y += layout.lineHeights[i] ?? 0;
  return y;
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
  | 'end'
  | 'home'
  | 'left'
  | 'none'
  | 'paste'
  | 'return'
  | 'right'
  | 'selectAll';

function isWordChar(char: string): boolean {
  return /\w/.test(char);
}

const TEXT_BOUNDS_GUTTER = 2;
