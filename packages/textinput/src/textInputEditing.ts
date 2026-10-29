// Generated from crates/flight-textinput/src/text_input_editing.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  KEY_CODE_A,
  KEY_CODE_BACKSPACE,
  KEY_CODE_C,
  KEY_CODE_DELETE,
  KEY_CODE_DOWN,
  KEY_CODE_END,
  KEY_CODE_HOME,
  KEY_CODE_LEFT,
  KEY_CODE_RETURN,
  KEY_CODE_RIGHT,
  KEY_CODE_UP,
  KEY_CODE_V,
  KEY_CODE_X,
} from '@flighthq/input/contract';
import type { InputKeyboardData } from '@flighthq/input/contract';
import { invalidateNodeAppearance, invalidateNodeLocalContent } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { setRichTextScrollH, setRichTextScrollV } from '@flighthq/text/contract';
import type { RichText, TextInputHistoryEntry, TextInputState } from '@flighthq/text/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import {
  TEXT_BOUNDS_GUTTER,
  createTextFormatRange,
  getRichTextSelectionRectangles,
} from '@flighthq/textlayout/contract';
import type { TextLayoutGroup, TextLayoutResult, TextSelectionRectangle } from '@flighthq/textlayout/contract';
import {
  getNextGraphemeBoundary,
  getPreviousGraphemeBoundary,
  getWordRangeAt,
  segmentWords,
  webTextSegmenterBackend,
} from '@flighthq/textsegment/contract';
import type { TextSegment } from '@flighthq/textsegment/contract';

import { getTextInputState } from './textInput.ts';
import { utf16Len, utf16Replace, utf16Slice } from './textUnits.ts';
import type { HandleTextInputKeyboardOptions, ReplaceTextInputOptions } from './types.ts';

enum KeyboardCommand {
  Backspace = 'backspace',
  Copy = 'copy',
  Cut = 'cut',
  Delete = 'delete',
  DeleteWordBackward = 'deleteWordBackward',
  DeleteWordForward = 'deleteWordForward',
  DocumentEnd = 'documentEnd',
  DocumentStart = 'documentStart',
  Down = 'down',
  End = 'end',
  Home = 'home',
  Left = 'left',
  None = 'none',
  Paste = 'paste',
  Return = 'return',
  Right = 'right',
  SelectAll = 'selectAll',
  Up = 'up',
  WordLeft = 'wordLeft',
  WordRight = 'wordRight',
}

const DESIRED_CARET_X_UNSET: number = -1.0;

function addSigned(value: number, offset: number): number {
  return offset < 0 ? Math.max(0, value - -offset) : value + offset;
}

function adjustTextFormatRanges(
  ranges: TextFormatRangeRaw[],
  defaultFormat: TextFormat,
  beginIndex: number,
  endIndex: number,
  insertLength: number,
): void {
  const removeLength = endIndex - beginIndex;
  const offset = insertLength - removeLength;
  let index = 0;
  while (index < ranges.length) {
    const range = ranges[index];
    let remove = false;
    if (beginIndex === endIndex) {
      if (range.end < beginIndex) {
      } else {
        if (range.start >= beginIndex) {
          range.start = addSigned(range.start, offset);
          range.end = addSigned(range.end, offset);
        } else {
          if (range.start < beginIndex && range.end >= beginIndex) {
            range.end = addSigned(range.end, offset);
          }
        }
      }
    } else {
      if (range.end <= beginIndex) {
      } else {
        if (range.start > endIndex) {
          range.start = addSigned(range.start, offset);
          range.end = addSigned(range.end, offset);
        } else {
          if (range.start <= beginIndex && range.end > endIndex) {
            range.end = addSigned(range.end, offset);
          } else {
            if (range.start >= beginIndex && range.end <= endIndex) {
              remove = true;
            } else {
              if (range.end > endIndex && range.start > beginIndex && range.start <= endIndex) {
                range.start = beginIndex;
                range.end = addSigned(range.end, offset);
              } else {
                if (range.start < beginIndex && range.end > beginIndex && range.end <= endIndex) {
                  range.end = beginIndex;
                }
              }
            }
          }
        }
      }
    }
    if (remove) {
      (<T>(items: T[], index: number): T => {
        if (index >= items.length) {
          throw new RangeError('Vec removal index out of bounds');
        }
        return items.splice(index, 1)[0];
      })(ranges, index);
    } else {
      index += 1;
    }
  }
  (<T>(items: T[], keep: (item: T) => boolean): void => {
    let kept = 0;
    let index = 0;
    try {
      for (; index < items.length; index += 1) {
        const item = items[index];
        if (keep(item)) {
          items[kept] = item;
          kept += 1;
        }
      }
    } finally {
      const length = items.length;
      for (let rest = index; rest < length; rest += 1) {
        items[kept + rest - index] = items[rest];
      }
      items.length = kept + length - index;
    }
  })(ranges, (range) => range.start < range.end);
  if (ranges.length === 0 && insertLength > 0) {
    const format = defaultFormat!;
    ranges.push(createTextFormatRange(format, beginIndex, beginIndex + insertLength));
  }
}

export function appendTextInput(source: RichText, text: string): void {
  const length = utf16Len(source!.data.text);
  replaceTextInput(source, length | 0, length | 0, text, undefined);
}

function applyHistoryRecord(
  source: RichText,
  state: TextInputState,
  text: string,
  caretIndex: number,
  selectionIndex: number,
): void {
  source!.data.text = String(text);
  const length = utf16Len(text);
  state = state!;
  state.caretIndex = Math.min(caretIndex, length);
  state.selectionIndex = Math.min(selectionIndex, length);
  state.desiredCaretX = DESIRED_CARET_X_UNSET;
  void state;
  invalidateLocalContent(source);
}

export function applyTextInputRestriction(source: RichText, text: string, replaceLength: number): string {
  const [multiline, maxChars, currentLength] = (() => {
    source = source!;
    return [source.data.multiline, source.data.maxChars, utf16Len(source.data.text)];
  })();
  let value = multiline
    ? String(text)
    : [...text].filter((character) => character !== '\n' && character !== '\r').join('');
  const restrict = getInputState(source)!.restrict;
  value = restrictTextInput(value, restrict);
  if (maxChars > 0) {
    const maxLength = maxChars - currentLength + replaceLength;
    if (maxLength <= 0) {
      return '';
    }
    if (utf16Len(value) > maxLength) {
      value = utf16Slice(value, 0, maxLength);
    }
  }
  return value;
}

export function canRedoTextInput(source: RichText): boolean {
  let state = getInputState(source);
  state = state!;
  return state.historyIndex < (state.history.length | 0) - 1;
}

export function canUndoTextInput(source: RichText): boolean {
  return getInputState(source)!.historyIndex >= 0;
}

function clampIndex(value: number, length: number): number {
  if (value <= 0) {
    return 0;
  }
  return Math.min(value, length);
}

export function clearTextInputHistory(source: RichText): void {
  let state = getInputState(source);
  state = state!;
  state.history = [] as never[];
  state.historyIndex = -1;
}

export function deleteTextInputBackward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start | 0, end | 0, '', undefined);
  } else {
    if (start > 0) {
      const text = source!.data.text;
      const previous = getPreviousGraphemeBoundary(webTextSegmenterBackend, text, usizeToI32(start), undefined);
      replaceTextInput(source, previous | 0, start | 0, '', undefined);
    }
  }
  const state = getInputState(source);
  const caret = state!.caretIndex;
  state!.selectionIndex = caret;
}

export function deleteTextInputForward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start | 0, end | 0, '', undefined);
  } else {
    const text = source!.data.text;
    if (start < utf16Len(text)) {
      const next = getNextGraphemeBoundary(webTextSegmenterBackend, text, usizeToI32(start), undefined);
      replaceTextInput(source, start | 0, next | 0, '', undefined);
    }
  }
}

export function deleteTextInputWordBackward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start | 0, end | 0, '', undefined);
    return;
  }
  const text = source!.data.text;
  const wordStart = findWordStartBefore(text, start);
  if (wordStart < start) {
    replaceTextInput(source, wordStart | 0, start | 0, '', undefined);
  }
}

export function deleteTextInputWordForward(source: RichText): void {
  const start = getTextInputSelectionBeginIndex(source);
  const end = getTextInputSelectionEndIndex(source);
  if (start !== end) {
    replaceTextInput(source, start | 0, end | 0, '', undefined);
    return;
  }
  const text = source!.data.text;
  const wordEnd = findWordEndAfter(text, start);
  if (wordEnd > start) {
    replaceTextInput(source, start | 0, wordEnd | 0, '', undefined);
  }
}

function findWordEndAfter(text: string, index: number): number {
  const length = utf16Len(text);
  const clamped = Math.min(index, length);
  let segments: TextSegment[] = [] as never[];
  segmentWords(segments, webTextSegmenterBackend, text, undefined);
  for (const segment of segments) {
    if (segment.isWordLike === true && segment.end > clamped) {
      return segment.end;
    }
  }
  return length;
}

function findWordStartBefore(text: string, index: number): number {
  const clamped = Math.min(index, utf16Len(text));
  let segments: TextSegment[] = [] as never[];
  segmentWords(segments, webTextSegmenterBackend, text, undefined);
  for (const segment of [...segments].reverse()) {
    if (segment.isWordLike === true && segment.start < clamped) {
      return segment.start;
    }
  }
  return 0;
}

function getCaretLineIndex(source: RichText, layout: Readonly<TextLayoutResult>): number {
  let out = createTextSelectionRectangle();
  getTextInputCaretRectangle(out, source, layout);
  return out.lineIndex;
}

function createTextSelectionRectangle(): TextSelectionRectangle {
  return { height: 0.0, lineIndex: 0, width: 0.0, x: 0.0, y: 0.0 };
}

function getFallbackLineHeight(layout: Readonly<TextLayoutResult>): number {
  const lineHeights: Readonly<number[]> = layout.lineHeights;
  return lineHeights[0] ?? 12.0;
}

function getInputState(source: RichText): TextInputState {
  {
    const $state = getTextInputState(source) ?? undefined;
    if ($state !== undefined) {
      const state = $state;
      return state;
    }
  }
  throw new Error('text input is not enabled on this RichText; call enableTextInput first');
}

function getKeyboardCommand(data: Readonly<InputKeyboardData>): KeyboardCommand {
  if (data.ctrlKey || data.metaKey) {
    let key: string = data.key;
    key = key.toLowerCase();
    if (key === 'a' || data.keyCode === KEY_CODE_A) {
      return KeyboardCommand.SelectAll;
    }
    if (key === 'c' || data.keyCode === KEY_CODE_C) {
      return KeyboardCommand.Copy;
    }
    if (key === 'v' || data.keyCode === KEY_CODE_V) {
      return KeyboardCommand.Paste;
    }
    if (key === 'x' || data.keyCode === KEY_CODE_X) {
      return KeyboardCommand.Cut;
    }
    if (data.keyCode === KEY_CODE_LEFT || data.key === 'ArrowLeft') {
      return KeyboardCommand.WordLeft;
    }
    if (data.keyCode === KEY_CODE_RIGHT || data.key === 'ArrowRight') {
      return KeyboardCommand.WordRight;
    }
    if (data.keyCode === KEY_CODE_BACKSPACE || data.key === 'Backspace') {
      return KeyboardCommand.DeleteWordBackward;
    }
    if (data.keyCode === KEY_CODE_DELETE || data.key === 'Delete') {
      return KeyboardCommand.DeleteWordForward;
    }
    if (data.keyCode === KEY_CODE_HOME || data.key === 'Home') {
      return KeyboardCommand.DocumentStart;
    }
    if (data.keyCode === KEY_CODE_END || data.key === 'End') {
      return KeyboardCommand.DocumentEnd;
    }
    return KeyboardCommand.None;
  }
  if (data.altKey) {
    if (data.keyCode === KEY_CODE_LEFT || data.key === 'ArrowLeft') {
      return KeyboardCommand.WordLeft;
    }
    if (data.keyCode === KEY_CODE_RIGHT || data.key === 'ArrowRight') {
      return KeyboardCommand.WordRight;
    }
    if (data.keyCode === KEY_CODE_BACKSPACE || data.key === 'Backspace') {
      return KeyboardCommand.DeleteWordBackward;
    }
    if (data.keyCode === KEY_CODE_DELETE || data.key === 'Delete') {
      return KeyboardCommand.DeleteWordForward;
    }
  }
  if (data.keyCode === KEY_CODE_BACKSPACE || data.key === 'Backspace') {
    return KeyboardCommand.Backspace;
  }
  if (data.keyCode === KEY_CODE_DELETE || data.key === 'Delete') {
    return KeyboardCommand.Delete;
  }
  if (data.keyCode === KEY_CODE_DOWN || data.key === 'ArrowDown') {
    return KeyboardCommand.Down;
  }
  if (data.keyCode === KEY_CODE_END || data.key === 'End') {
    return KeyboardCommand.End;
  }
  if (data.keyCode === KEY_CODE_HOME || data.key === 'Home') {
    return KeyboardCommand.Home;
  }
  if (data.keyCode === KEY_CODE_LEFT || data.key === 'ArrowLeft') {
    return KeyboardCommand.Left;
  }
  if (data.keyCode === KEY_CODE_RETURN || data.key === 'Enter') {
    return KeyboardCommand.Return;
  }
  if (data.keyCode === KEY_CODE_RIGHT || data.key === 'ArrowRight') {
    return KeyboardCommand.Right;
  }
  if (data.keyCode === KEY_CODE_UP || data.key === 'ArrowUp') {
    return KeyboardCommand.Up;
  }
  return KeyboardCommand.None;
}

function getLineEndIndex(layout: Readonly<TextLayoutResult>, lineIndex: number, textLength: number): number {
  let end = undefined;
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) {
      end = Math.max(end ?? 0, group.endIndex);
    }
  }
  return end ?? textLength;
}

function getLineOffsetY(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) {
      return group.offsetY;
    }
  }
  let y = TEXT_BOUNDS_GUTTER;
  const lineHeights: Readonly<number[]> = layout.lineHeights;
  for (let index = 0; index < lineIndex; index += 1) {
    y += lineHeights[index] ?? 0.0;
  }
  return y;
}

function getLineStartIndex(layout: Readonly<TextLayoutResult>, lineIndex: number): number {
  let start: number | undefined = undefined;
  for (const group of layout.groups) {
    if (group.lineIndex === lineIndex) {
      if (start !== undefined) {
        const previousStart = start;
        start = Math.min(previousStart, group.startIndex);
      } else {
        start = group.startIndex;
      }
    }
  }
  return start ?? 0;
}

export function getTextInputCaretIndex(source: RichText): number {
  const length = utf16Len(source!.data.text);
  return Math.min(getInputState(source)!.caretIndex, length);
}

export function getTextInputCaretRectangle(
  out: TextSelectionRectangle,
  source: RichText,
  layout: Readonly<TextLayoutResult>,
): void {
  const caretIndex = getTextInputCaretIndex(source);
  const group = getTextLayoutGroupAtIndex(layout, caretIndex);
  if (group === undefined) {
    out.x = TEXT_BOUNDS_GUTTER;
    out.y = TEXT_BOUNDS_GUTTER;
    out.width = 1.0;
    out.height = getFallbackLineHeight(layout);
    out.lineIndex = 0;
    return;
  }
  out.x = getTextLayoutGroupCaretX(group, caretIndex);
  out.y = group.offsetY;
  out.width = 1.0;
  out.height = group.height;
  out.lineIndex = group.lineIndex;
}

export function getTextInputCharacterIndexAtPoint(
  source: RichText,
  layout: Readonly<TextLayoutResult>,
  x: number,
  y: number,
): number {
  if (layout.groups.length === 0) {
    return 0;
  }
  let closestLineIndex = 0;
  let closestLineDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.lineHeights.length; index += 1) {
    const lineTop = getLineOffsetY(layout, index);
    const lineBottom = lineTop + layout.lineHeights[index];
    const distance = y < lineTop ? lineTop - y : y > lineBottom ? y - lineBottom : 0.0;
    if (distance < closestLineDistance) {
      closestLineDistance = distance;
      closestLineIndex = index;
    }
  }
  let lineStart = utf16Len(source!.data.text);
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
      return getTextLayoutGroupCharacterIndexAtX(group, x);
    }
  }
  return lineEnd > 0 ? lineEnd : lineStart;
}

export function getTextInputDisplayText(source: RichText): string {
  let state = getInputState(source);
  state = state!;
  const text = source!.data.text;
  if (!state.displayAsPassword) {
    return text;
  }
  const passwordCharacter: string =
    state.passwordCharacter.length === 0 ? '•' : utf16Slice(state.passwordCharacter, 0, 1);
  return passwordCharacter.repeat(utf16Len(text));
}

export function getTextInputSelectionBeginIndex(source: RichText): number {
  const length = utf16Len(source!.data.text);
  let state = getInputState(source);
  state = state!;
  return Math.min(Math.min(state.caretIndex, length), Math.min(state.selectionIndex, length));
}

export function getTextInputSelectionEndIndex(source: RichText): number {
  const length = utf16Len(source!.data.text);
  let state = getInputState(source);
  state = state!;
  return Math.max(Math.min(state.caretIndex, length), Math.min(state.selectionIndex, length));
}

export function getTextInputSelectionRectangles(
  out: TextSelectionRectangle[],
  source: RichText,
  layout: Readonly<TextLayoutResult>,
): void {
  getRichTextSelectionRectangles(
    out,
    getTextInputSelectionBeginIndex(source),
    getTextInputSelectionEndIndex(source),
    layout,
  );
}

export function getTextInputSelectionText(source: RichText): string {
  const text = source!.data.text;
  return utf16Slice(text, getTextInputSelectionBeginIndex(source), getTextInputSelectionEndIndex(source));
}

function getTextLayoutGroupAtIndex(
  layout: Readonly<TextLayoutResult>,
  index: number,
): Readonly<TextLayoutGroup> | undefined {
  const groups: Readonly<TextLayoutGroup[]> = layout.groups;
  for (const group of groups) {
    if (index >= group.startIndex && index <= group.endIndex) {
      return group;
    }
  }
  return groups.at(-1);
}

function getTextLayoutGroupCaretX(group: Readonly<TextLayoutGroup>, index: number): number {
  let x = group.offsetX;
  const limit = Math.max(0, Math.min(index, group.endIndex) - group.startIndex);
  const positions: Readonly<number[]> = group.positions;
  for (let positionIndex = 0; positionIndex < limit; positionIndex += 1) {
    x += positions[positionIndex] ?? 0.0;
  }
  return x;
}

function getTextLayoutGroupCharacterIndexAtX(group: Readonly<TextLayoutGroup>, x: number): number {
  let currentX = group.offsetX;
  for (const [index, advance] of group.positions.entries()) {
    if (x < currentX + advance / 2.0) {
      return group.startIndex + index;
    }
    currentX += advance;
  }
  return group.endIndex;
}

export function handleTextInputKeyboard(
  source: RichText,
  data: Readonly<InputKeyboardData>,
  options?: Readonly<HandleTextInputKeyboardOptions>,
): boolean {
  const command = getKeyboardCommand(data);
  switch (command) {
    case KeyboardCommand.None:
      break;
    case KeyboardCommand.Backspace:
      deleteTextInputBackward(source);
      break;
    case KeyboardCommand.Copy:
      const copyText = getTextInputSelectionText(source);
      if (copyText.length !== 0) {
        {
          const $onCopy = ((options) => (options === undefined ? undefined : options.onCopy))(options);
          if ($onCopy !== undefined) {
            const onCopy = $onCopy;
            onCopy(copyText);
          }
        }
      }
      break;
    case KeyboardCommand.Cut:
      const cutText = getTextInputSelectionText(source);
      if (cutText.length !== 0) {
        {
          const $onCopy = ((options) => (options === undefined ? undefined : options.onCopy))(options);
          if ($onCopy !== undefined) {
            const onCopy = $onCopy;
            onCopy(cutText);
          }
        }
        replaceSelectedTextInput(source, '', undefined);
      }
      break;
    case KeyboardCommand.Delete:
      deleteTextInputForward(source);
      break;
    case KeyboardCommand.DeleteWordBackward:
      deleteTextInputWordBackward(source);
      break;
    case KeyboardCommand.DeleteWordForward:
      deleteTextInputWordForward(source);
      break;
    case KeyboardCommand.DocumentEnd:
      const length = utf16Len(source!.data.text);
      moveTextInputCaret(source, length | 0, data.shiftKey);
      break;
    case KeyboardCommand.DocumentStart:
      moveTextInputCaret(source, 0, data.shiftKey);
      break;
    case KeyboardCommand.Down:
      const downLayout = ((options) => (options === undefined ? undefined : options.layout))(options);
      if (downLayout !== undefined) {
        moveTextInputCaretDown(source, downLayout!, data.shiftKey);
      } else {
        moveTextInputCaretDown(source, undefined, data.shiftKey);
      }
      break;
    case KeyboardCommand.End:
      const endLayout = ((options) => (options === undefined ? undefined : options.layout))(options);
      if (endLayout !== undefined) {
        moveTextInputCaretToLineEnd(source, endLayout!, data.shiftKey);
      } else {
        moveTextInputCaretToLineEnd(source, undefined, data.shiftKey);
      }
      break;
    case KeyboardCommand.Home:
      const homeLayout = ((options) => (options === undefined ? undefined : options.layout))(options);
      if (homeLayout !== undefined) {
        moveTextInputCaretToLineStart(source, homeLayout!, data.shiftKey);
      } else {
        moveTextInputCaretToLineStart(source, undefined, data.shiftKey);
      }
      break;
    case KeyboardCommand.Left:
      const leftText = source!.data.text;
      const leftCaret = getTextInputCaretIndex(source);
      const previous = getPreviousGraphemeBoundary(webTextSegmenterBackend, leftText, usizeToI32(leftCaret), undefined);
      moveTextInputCaret(source, previous | 0, data.shiftKey);
      break;
    case KeyboardCommand.Paste:
      insertTextInput(
        source,
        ((options) => (options === undefined ? undefined : options.clipboardText))(options) ?? '',
      );
      break;
    case KeyboardCommand.Return:
      if (!source!.data.multiline) {
        return false;
      }
      insertTextInput(source, '\n');
      break;
    case KeyboardCommand.Right:
      const rightText = source!.data.text;
      const rightCaret = getTextInputCaretIndex(source);
      const next = getNextGraphemeBoundary(webTextSegmenterBackend, rightText, usizeToI32(rightCaret), undefined);
      moveTextInputCaret(source, next | 0, data.shiftKey);
      break;
    case KeyboardCommand.SelectAll:
      selectAllTextInput(source);
      break;
    case KeyboardCommand.Up:
      const upLayout = ((options) => (options === undefined ? undefined : options.layout))(options);
      if (upLayout !== undefined) {
        moveTextInputCaretUp(source, upLayout!, data.shiftKey);
      } else {
        moveTextInputCaretUp(source, undefined, data.shiftKey);
      }
      break;
    case KeyboardCommand.WordLeft:
      moveTextInputCaretByWord(source, -1, data.shiftKey);
      break;
    case KeyboardCommand.WordRight:
      moveTextInputCaretByWord(source, 1, data.shiftKey);
      break;
  }
  return command !== KeyboardCommand.None;
}

export function insertTextInput(source: RichText, text: string): void {
  const options: ReplaceTextInputOptions = { applyInputRules: true, mergeKind: undefined, skipHistory: undefined };
  replaceSelectedTextInput(source, text, options);
}

function invalidateAppearance(source: RichText): void {
  const node: NodeRef = source;
  invalidateNodeAppearance(node);
}

function invalidateLocalContent(source: RichText): void {
  const node: NodeRef = source;
  invalidateNodeLocalContent(node);
}

function matchesRestrictRanges(character: string, ranges: string): boolean {
  const rangeCharacters: string[] = [...ranges];
  let index = 0;
  while (index < rangeCharacters.length) {
    const current = rangeCharacters[index];
    if (current === '\\' && index + 1 < rangeCharacters.length) {
      if (character === rangeCharacters[index + 1]) {
        return true;
      }
      index += 2;
      continue;
    }
    if (index + 2 < rangeCharacters.length && rangeCharacters[index + 1] === '-') {
      const end = rangeCharacters[index + 2];
      if (character >= current && character <= end) {
        return true;
      }
      index += 3;
      continue;
    }
    if (character === current) {
      return true;
    }
    index += 1;
  }
  return false;
}

export function moveTextInputCaret(source: RichText, index: number, extendSelection: boolean): void {
  const length = utf16Len(source!.data.text);
  const caret = clampIndex(index, length);
  let state = getInputState(source);
  state = state!;
  state.caretIndex = caret;
  if (!extendSelection) {
    state.selectionIndex = caret;
  }
  state.desiredCaretX = DESIRED_CARET_X_UNSET;
  void state;
  invalidateAppearance(source);
}

export function moveTextInputCaretByWord(source: RichText, direction: number, extendSelection: boolean): void {
  const caretIndex = getTextInputCaretIndex(source);
  const text = source!.data.text;
  const target = direction < 0 ? findWordStartBefore(text, caretIndex) : findWordEndAfter(text, caretIndex);
  moveTextInputCaret(source, target | 0, extendSelection);
}

export function moveTextInputCaretDown(
  source: RichText,
  layout: Readonly<TextLayoutResult> | undefined,
  extendSelection: boolean,
): void {
  if (layout === undefined) {
    const length = utf16Len(source!.data.text);
    moveTextInputCaret(source, length | 0, extendSelection);
    return;
  }
  let state = getInputState(source);
  let out = createTextSelectionRectangle();
  getTextInputCaretRectangle(out, source, layout);
  const desiredX = (() => {
    state = state!;
    if (state.desiredCaretX === DESIRED_CARET_X_UNSET) {
      state.desiredCaretX = out.x;
    }
    return state.desiredCaretX;
  })();
  const targetLineIndex = out.lineIndex + 1;
  if (targetLineIndex >= layout.numLines) {
    const length = utf16Len(source!.data.text);
    moveTextInputCaret(source, length | 0, extendSelection);
    return;
  }
  const targetY = getLineOffsetY(layout, targetLineIndex) + layout.lineHeights[targetLineIndex] / 2.0;
  const targetIndex = getTextInputCharacterIndexAtPoint(source, layout, desiredX, targetY);
  const length = utf16Len(source!.data.text);
  const newCaret = Math.min(targetIndex, length);
  state = state!;
  state.caretIndex = newCaret;
  if (!extendSelection) {
    state.selectionIndex = newCaret;
  }
  void state;
  invalidateAppearance(source);
}

export function moveTextInputCaretToLineEnd(
  source: RichText,
  layout: Readonly<TextLayoutResult> | undefined,
  extendSelection: boolean,
): void {
  const textLength = utf16Len(source!.data.text);
  if (layout === undefined) {
    moveTextInputCaret(source, textLength | 0, extendSelection);
    return;
  }
  const lineIndex = getCaretLineIndex(source, layout);
  moveTextInputCaret(source, getLineEndIndex(layout, lineIndex, textLength) | 0, extendSelection);
}

export function moveTextInputCaretToLineStart(
  source: RichText,
  layout: Readonly<TextLayoutResult> | undefined,
  extendSelection: boolean,
): void {
  if (layout === undefined) {
    moveTextInputCaret(source, 0, extendSelection);
    return;
  }
  const lineIndex = getCaretLineIndex(source, layout);
  moveTextInputCaret(source, getLineStartIndex(layout, lineIndex) | 0, extendSelection);
}

export function moveTextInputCaretUp(
  source: RichText,
  layout: Readonly<TextLayoutResult> | undefined,
  extendSelection: boolean,
): void {
  if (layout === undefined) {
    moveTextInputCaret(source, 0, extendSelection);
    return;
  }
  let state = getInputState(source);
  let out = createTextSelectionRectangle();
  getTextInputCaretRectangle(out, source, layout);
  const desiredX = (() => {
    state = state!;
    if (state.desiredCaretX === DESIRED_CARET_X_UNSET) {
      state.desiredCaretX = out.x;
    }
    return state.desiredCaretX;
  })();
  if (out.lineIndex === 0) {
    moveTextInputCaret(source, 0, extendSelection);
    return;
  }
  const targetLineIndex = out.lineIndex - 1;
  const targetY = getLineOffsetY(layout, targetLineIndex) + layout.lineHeights[targetLineIndex] / 2.0;
  const targetIndex = getTextInputCharacterIndexAtPoint(source, layout, desiredX, targetY);
  const length = utf16Len(source!.data.text);
  const newCaret = Math.min(targetIndex, length);
  state = state!;
  state.caretIndex = newCaret;
  if (!extendSelection) {
    state.selectionIndex = newCaret;
  }
  void state;
  invalidateAppearance(source);
}

function recordTextInputEdit(
  state: TextInputState,
  textBefore: string,
  textAfter: string,
  caretIndexBefore: number,
  selectionIndexBefore: number,
  mergeKind?: string,
): void {
  if (state.historyIndex < (state.history.length | 0) - 1) {
    const historyIndex = Math.max(state.historyIndex + 1, 0);
    const history: TextInputHistoryEntry[] = state.history;
    (<T>(items: T[], length: number): void => {
      items.length = Math.min(items.length, length);
    })(history, historyIndex);
  }
  if (state.historyIndex >= 0) {
    const previous = state.history[state.historyIndex];
    if (mergeKind !== undefined && previous.mergeKind === mergeKind) {
      previous.textAfter = String(textAfter);
      previous.caretIndexAfter = state.caretIndex;
      previous.selectionIndexAfter = state.selectionIndex;
      return;
    }
  }
  state.history.push({
    caretIndexAfter: state.caretIndex,
    caretIndexBefore: caretIndexBefore,
    mergeKind: ((value) => (value === undefined ? undefined : String(value)))(mergeKind) ?? null,
    selectionIndexAfter: state.selectionIndex,
    selectionIndexBefore: selectionIndexBefore,
    textAfter: String(textAfter),
    textBefore: String(textBefore),
  });
  state.historyIndex = (state.history.length | 0) - 1;
  if (state.history.length > state.historyLimit) {
    const overflow = state.history.length - state.historyLimit;
    const history: TextInputHistoryEntry[] = state.history;
    (<T>(items: T[], start: number, end: number): T[] => items.splice(start, end - start))(history, 0, overflow);
    state.historyIndex = (history.length | 0) - 1;
  }
}

export function redoTextInput(source: RichText): void {
  const state = getInputState(source);
  let stateGuard = state!;
  if (stateGuard.historyIndex >= (stateGuard.history.length | 0) - 1) {
    return;
  }
  stateGuard.historyIndex += 1;
  const record = stateGuard.history[stateGuard.historyIndex];
  void stateGuard;
  applyHistoryRecord(source, state, record.textAfter, record.caretIndexAfter, record.selectionIndexAfter);
}

export function replaceSelectedTextInput(
  source: RichText,
  text: string,
  options?: Readonly<ReplaceTextInputOptions>,
): void {
  replaceTextInput(
    source,
    getTextInputSelectionBeginIndex(source) | 0,
    getTextInputSelectionEndIndex(source) | 0,
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
  const textBefore = source!.data.text;
  const length = utf16Len(textBefore);
  let start = clampIndex(beginIndex, length);
  let end = clampIndex(endIndex, length);
  if (end < start) {
    const previousStart = start;
    start = end;
    end = previousStart;
  }
  const value =
    (options?.applyInputRules ?? false) ? applyTextInputRestriction(source, text, end - start) : String(text);
  if (value.length === 0 && start === end) {
    return;
  }
  const state = getInputState(source);
  const [caretBefore, selectionBefore] = (() => {
    const stateGuard = state!;
    return [Math.min(stateGuard.caretIndex, length), Math.min(stateGuard.selectionIndex, length)];
  })();
  const textAfter = utf16Replace(textBefore, start, end, value);
  const insertLength = utf16Len(value);
  let sourceState = source!;
  sourceState.data.text = textAfter;
  const defaultFormat = sourceState.data.defaultTextFormat;
  adjustTextFormatRanges(sourceState.data.textFormatRanges, defaultFormat, start, end, insertLength);
  void sourceState;
  let inputState = state!;
  inputState.desiredCaretX = DESIRED_CARET_X_UNSET;
  inputState.selectionIndex = start + insertLength;
  inputState.caretIndex = start + insertLength;
  void inputState;
  invalidateAppearance(source);
  let historyState = state!;
  if (!(options?.skipHistory ?? false) && historyState.historyLimit > 0) {
    recordTextInputEdit(
      historyState,
      textBefore,
      textAfter,
      caretBefore,
      selectionBefore,
      ((options) => (options === undefined ? undefined : options.mergeKind))(options),
    );
  }
  void historyState;
  invalidateLocalContent(source);
}

function restrictTextInput(text: string, restrict: string): string {
  if (restrict.length === 0 || text.length === 0) {
    return String(text);
  }
  const [accepted, declined] = splitRestrictRanges(restrict);
  let out = '';
  for (const character of [...text]) {
    const acceptedMatch = accepted.length === 0 || matchesRestrictRanges(character, accepted);
    const declinedMatch = declined.length !== 0 && matchesRestrictRanges(character, declined);
    if (acceptedMatch && !declinedMatch) {
      out += character;
    }
  }
  return out;
}

export function scrollTextInputCaretIntoView(
  source: RichText,
  layout: Readonly<TextLayoutResult>,
  viewportWidth: number,
  viewportHeight: number,
): void {
  let out = createTextSelectionRectangle();
  getTextInputCaretRectangle(out, source, layout);
  const caretTop = out.y;
  const caretBottom = out.y + out.height;
  const [scrollV, scrollH] = (() => {
    source = source!;
    return [source.data.scrollV, source.data.scrollH];
  })();
  const scrollVLine = Math.max((scrollV | 0) - 1, 0);
  let viewTop = 0.0;
  const lineHeights: Readonly<number[]> = layout.lineHeights;
  for (let index = 0; index < scrollVLine; index += 1) {
    viewTop += lineHeights[index] ?? 0.0;
  }
  const viewBottom = viewTop + viewportHeight;
  if (caretTop < viewTop) {
    setRichTextScrollV(source, out.lineIndex + 1, layout);
  } else {
    if (caretBottom > viewBottom) {
      let pixelOffset = 0.0;
      let firstVisibleLine = 0;
      for (let index = 0; index < layout.numLines; index += 1) {
        if (pixelOffset + layout.lineHeights[index] > caretBottom - viewportHeight) {
          firstVisibleLine = index;
          break;
        }
        pixelOffset += layout.lineHeights[index];
      }
      setRichTextScrollV(source, firstVisibleLine + 1, layout);
    }
  }
  const caretLeft = out.x - scrollH;
  const caretRight = caretLeft + out.width;
  if (caretLeft < 0.0) {
    setRichTextScrollH(source, Math.max(out.x - 8.0, 0.0), layout);
  } else {
    if (caretRight + 8.0 > viewportWidth) {
      setRichTextScrollH(source, out.x + out.width + 8.0 - viewportWidth, layout);
    }
  }
}

export function selectAllTextInput(source: RichText): void {
  const length = utf16Len(source!.data.text);
  setTextInputSelection(source, 0, length | 0);
}

export function selectLineAtTextInputIndex(source: RichText, index: number): void {
  const text = source!.data.text;
  const units: number[] = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));
  const clamped = clampIndex(index, units.length);
  let start = clamped;
  let end = clamped;
  while (start > 0 && units[start - 1] !== 10) {
    start -= 1;
  }
  while (end < units.length && units[end] !== 10) {
    end += 1;
  }
  setTextInputSelection(source, start | 0, end | 0);
}

export function selectWordAtTextInputIndex(source: RichText, index: number): void {
  const text = source!.data.text;
  const length = utf16Len(text);
  const clamped = clampIndex(index, length);
  let segments: TextSegment[] = [] as never[];
  segmentWords(segments, webTextSegmenterBackend, text, undefined);
  if (clamped > 0) {
    {
      const $segment = segments.find((segment) => segment.end === clamped && segment.isWordLike === true);
      if ($segment !== undefined) {
        const segment = $segment;
        setTextInputSelection(source, segment.start | 0, segment.end | 0);
        return;
      }
    }
  }
  {
    const $range = getWordRangeAt(webTextSegmenterBackend, text, usizeToI32(clamped), undefined) ?? undefined;
    if ($range !== undefined) {
      const range = $range;
      setTextInputSelection(source, range.start | 0, range.end | 0);
      return;
    }
  }
  if (text.length === 0) {
    setTextInputSelection(source, 0, 0);
    return;
  }
  const lookup = clamped === length ? Math.max(0, clamped - 1) : clamped;
  let segmentIndex = (<T>(items: readonly T[], predicate: (item: T) => boolean): number | undefined => {
    const index = items.findIndex(predicate);
    return index === -1 ? undefined : index;
  })(segments, (segment) => lookup >= segment.start && lookup < segment.end);
  if (segmentIndex === undefined) {
    setTextInputSelection(source, clamped | 0, clamped | 0);
    return;
  }
  let start = segments[segmentIndex].start;
  let end = segments[segmentIndex].end;
  while (segmentIndex > 0 && segments[segmentIndex - 1].isWordLike !== true) {
    segmentIndex -= 1;
    start = segments[segmentIndex].start;
  }
  segmentIndex =
    (<T>(items: readonly T[], predicate: (item: T) => boolean): number | undefined => {
      const index = items.findIndex(predicate);
      return index === -1 ? undefined : index;
    })(segments, (segment) => segment.start === start) ?? 0;
  while (segmentIndex + 1 < segments.length && segments[segmentIndex + 1].isWordLike !== true) {
    segmentIndex += 1;
    end = segments[segmentIndex].end;
  }
  setTextInputSelection(source, start | 0, end | 0);
}

export function setTextInputSelection(source: RichText, beginIndex: number, endIndex: number): void {
  const length = utf16Len(source!.data.text);
  let state = getInputState(source);
  state = state!;
  state.selectionIndex = clampIndex(beginIndex, length);
  state.caretIndex = clampIndex(endIndex, length);
  void state;
  invalidateAppearance(source);
}

function splitRestrictRanges(restrict: string): readonly [string, string] {
  const characters: string[] = [...restrict];
  let accepted = '';
  let declined = '';
  let declining = false;
  let index = 0;
  while (index < characters.length) {
    const character = characters[index];
    if (character === '\\' && index + 1 < characters.length) {
      if (declining) {
        declined += character;
        declined += characters[index + 1];
      } else {
        accepted += character;
        accepted += characters[index + 1];
      }
      index += 2;
      continue;
    }
    if (character === '^') {
      declining = !declining;
    } else {
      if (declining) {
        declined += character;
      } else {
        accepted += character;
      }
    }
    index += 1;
  }
  return [accepted, declined];
}

export function undoTextInput(source: RichText): void {
  const state = getInputState(source);
  let stateGuard = state!;
  if (stateGuard.historyIndex < 0) {
    return;
  }
  const record = stateGuard.history[stateGuard.historyIndex];
  stateGuard.historyIndex -= 1;
  void stateGuard;
  applyHistoryRecord(source, state, record.textBefore, record.caretIndexBefore, record.selectionIndexBefore);
}

function usizeToI32(value: number): number {
  return Math.min(value, 2_147_483_647) | 0;
}
