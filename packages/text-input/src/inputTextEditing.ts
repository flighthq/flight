import { getInputTextRuntime } from '@flighthq/displayobject';
import { invalidateNodeAppearance } from '@flighthq/node';
import { getRichTextSelectionRectangles } from '@flighthq/text-layout';
import type {
  HandleInputTextKeyboardOptions,
  InputText,
  InputTextData,
  InputTextRuntime,
  InputTextSelectionRectangle,
  KeyboardEventData,
  ReplaceInputTextOptions,
  TextFormatRange,
  TextLayoutGroup,
  TextLayoutResult,
} from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

export function appendInputText(source: InputText, text: string): void {
  replaceInputText(source, source.data.text.length, source.data.text.length, text);
}

export function applyInputTextRestriction(data: Readonly<InputTextData>, text: string, replaceLength = 0): string {
  let value = text;
  if (!data.multiline) value = value.replace(/[\n\r]+/g, '');
  value = restrictInputText(value, data.restrict);

  if (data.maxChars > 0) {
    const maxLength = data.maxChars - data.text.length + replaceLength;
    if (maxLength <= 0) return '';
    if (value.length > maxLength) value = value.slice(0, maxLength);
  }

  return value;
}

export function deleteInputTextBackward(source: InputText): void {
  const runtime = getMutableRuntime(source);
  const start = getInputTextSelectionBeginIndex(source);
  const end = getInputTextSelectionEndIndex(source);
  if (start !== end) {
    replaceInputText(source, start, end, '');
  } else if (start > 0) {
    replaceInputText(source, start - 1, start, '');
  }
  runtime.selectionIndex = runtime.caretIndex;
}

export function deleteInputTextForward(source: InputText): void {
  const start = getInputTextSelectionBeginIndex(source);
  const end = getInputTextSelectionEndIndex(source);
  if (start !== end) {
    replaceInputText(source, start, end, '');
  } else if (start < source.data.text.length) {
    replaceInputText(source, start, start + 1, '');
  }
}

export function getInputTextCaretIndex(source: Readonly<InputText>): number {
  return clampIndex(getInputTextRuntime(source).caretIndex, source.data.text.length);
}

export function getInputTextCaretRectangle(
  out: InputTextSelectionRectangle,
  source: Readonly<InputText>,
  layout: Readonly<TextLayoutResult>,
): void {
  const caretIndex = getInputTextCaretIndex(source);
  const group = getTextLayoutGroupAtIndex(layout, caretIndex);
  if (group === null) {
    out.x = TEXT_FIELD_GUTTER;
    out.y = TEXT_FIELD_GUTTER;
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

export function getInputTextCharacterIndexAtPoint(
  source: Readonly<InputText>,
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

export function getInputTextDisplayText(source: Readonly<InputText>): string {
  if (!source.data.displayAsPassword) return source.data.text;
  const passwordCharacter =
    source.data.passwordCharacter.length > 0 ? source.data.passwordCharacter.charAt(0) : '\u2022';
  return passwordCharacter.repeat(source.data.text.length);
}

export function getInputTextSelectionBeginIndex(source: Readonly<InputText>): number {
  const runtime = getInputTextRuntime(source);
  return Math.min(
    clampIndex(runtime.caretIndex, source.data.text.length),
    clampIndex(runtime.selectionIndex, source.data.text.length),
  );
}

export function getInputTextSelectionEndIndex(source: Readonly<InputText>): number {
  const runtime = getInputTextRuntime(source);
  return Math.max(
    clampIndex(runtime.caretIndex, source.data.text.length),
    clampIndex(runtime.selectionIndex, source.data.text.length),
  );
}

export function getInputTextSelectionRectangles(
  out: InputTextSelectionRectangle[],
  source: Readonly<InputText>,
  layout: Readonly<TextLayoutResult>,
): void {
  getRichTextSelectionRectangles(
    out,
    getInputTextSelectionBeginIndex(source),
    getInputTextSelectionEndIndex(source),
    layout,
  );
}

export function getInputTextSelectionText(source: Readonly<InputText>): string {
  return source.data.text.slice(getInputTextSelectionBeginIndex(source), getInputTextSelectionEndIndex(source));
}

export function handleInputTextKeyboard(
  source: InputText,
  data: Readonly<KeyboardEventData>,
  options?: Readonly<HandleInputTextKeyboardOptions>,
): boolean {
  const command = getKeyboardCommand(data);
  if (command === 'none') return false;

  switch (command) {
    case 'backspace':
      deleteInputTextBackward(source);
      return true;
    case 'copy': {
      const copyText = getInputTextSelectionText(source);
      if (copyText.length > 0) options?.onCopy?.(copyText);
      return true;
    }
    case 'cut': {
      const cutText = getInputTextSelectionText(source);
      if (cutText.length > 0) {
        options?.onCopy?.(cutText);
        replaceSelectedInputText(source, '');
      }
      return true;
    }
    case 'delete':
      deleteInputTextForward(source);
      return true;
    case 'end':
      moveInputTextCaret(source, source.data.text.length, data.shiftKey);
      return true;
    case 'home':
      moveInputTextCaret(source, 0, data.shiftKey);
      return true;
    case 'left':
      moveInputTextCaret(source, getInputTextCaretIndex(source) - 1, data.shiftKey);
      return true;
    case 'paste':
      insertInputText(source, options?.clipboardText ?? '');
      return true;
    case 'return':
      if (!source.data.multiline) return false;
      insertInputText(source, '\n');
      return true;
    case 'right':
      moveInputTextCaret(source, getInputTextCaretIndex(source) + 1, data.shiftKey);
      return true;
    case 'selectAll':
      selectAllInputText(source);
      return true;
  }
}

export function insertInputText(source: InputText, text: string): void {
  replaceSelectedInputText(source, text, { applyInputRules: true });
}

export function moveInputTextCaret(source: InputText, index: number, extendSelection = false): void {
  const caret = clampIndex(index, source.data.text.length);
  const runtime = getMutableRuntime(source);
  runtime.caretIndex = caret;
  if (!extendSelection) runtime.selectionIndex = caret;
  invalidateNodeAppearance(source);
}

export function replaceInputText(
  source: InputText,
  beginIndex: number,
  endIndex: number,
  text: string,
  options?: Readonly<ReplaceInputTextOptions>,
): void {
  const data = source.data;
  let start = clampIndex(beginIndex, data.text.length);
  let end = clampIndex(endIndex, data.text.length);
  if (end < start) {
    const swap = start;
    start = end;
    end = swap;
  }

  const value = options?.applyInputRules === true ? applyInputTextRestriction(data, text, end - start) : text;
  if (value.length === 0 && start === end) return;

  data.text = data.text.slice(0, start) + value + data.text.slice(end);
  adjustTextFormatRanges(data.textFormatRanges, data.defaultTextFormat, start, end, value.length);
  setInputTextSelection(source, start + value.length, start + value.length);
  invalidateNodeAppearance(source);
}

export function replaceSelectedInputText(
  source: InputText,
  text: string,
  options?: Readonly<ReplaceInputTextOptions>,
): void {
  replaceInputText(
    source,
    getInputTextSelectionBeginIndex(source),
    getInputTextSelectionEndIndex(source),
    text,
    options,
  );
}

export function selectAllInputText(source: InputText): void {
  setInputTextSelection(source, 0, source.data.text.length);
}

export function selectLineAtInputTextIndex(source: InputText, index: number): void {
  const text = source.data.text;
  const clamped = Math.max(0, Math.min(text.length, index));
  let start = clamped;
  let end = clamped;
  while (start > 0 && text.charAt(start - 1) !== '\n') start--;
  while (end < text.length && text.charAt(end) !== '\n') end++;
  setInputTextSelection(source, start, end);
}

export function selectWordAtInputTextIndex(source: InputText, index: number): void {
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
  setInputTextSelection(source, start, end);
}

export function setInputTextSelection(source: InputText, beginIndex: number, endIndex: number): void {
  const runtime = getMutableRuntime(source);
  runtime.selectionIndex = clampIndex(beginIndex, source.data.text.length);
  runtime.caretIndex = clampIndex(endIndex, source.data.text.length);
  invalidateNodeAppearance(source);
}

function adjustTextFormatRanges(
  ranges: TextFormatRange[],
  defaultFormat: InputTextData['defaultTextFormat'],
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
  let y = TEXT_FIELD_GUTTER;
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

function getMutableRuntime(source: Readonly<InputText>) {
  return getInputTextRuntime(source) as InputTextRuntime;
}

function restrictInputText(text: string, restrict: string): string {
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

const TEXT_FIELD_GUTTER = 2;
