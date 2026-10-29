// Generated from crates/flight-textinput/tests/text_input_editing_test.rs by flight-compiler.
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
} from '@flighthq/input/contract';
import type { InputKeyboardData } from '@flighthq/input/contract';
import { getNodeAppearanceRevision } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { getRichTextRuntime, setRichTextFormatRange, setTextLayoutResult } from '@flighthq/text/contract';
import type { RichText, RichTextData, RichTextRuntime, TextInputOptions } from '@flighthq/text/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import { createTextLayoutGroup, createTextLayoutResult } from '@flighthq/textlayout/contract';
import type {
  TextAutoSize,
  TextLayoutGroup,
  TextLayoutResult,
  TextSelectionRectangle,
  TextVerticalAlign,
} from '@flighthq/textlayout/contract';
import { describe, expect, it } from 'vitest';

import {
  appendTextInput,
  applyTextInputRestriction,
  canRedoTextInput,
  canUndoTextInput,
  clearTextInputHistory,
  deleteTextInputBackward,
  deleteTextInputForward,
  deleteTextInputWordBackward,
  deleteTextInputWordForward,
  getTextInputCaretIndex,
  getTextInputCaretRectangle,
  getTextInputCharacterIndexAtPoint,
  getTextInputDisplayText,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputSelectionRectangles,
  getTextInputSelectionText,
  getTextInputState,
  handleTextInputKeyboard,
  insertTextInput,
  moveTextInputCaret,
  moveTextInputCaretByWord,
  moveTextInputCaretDown,
  moveTextInputCaretToLineEnd,
  moveTextInputCaretToLineStart,
  moveTextInputCaretUp,
  redoTextInput,
  replaceSelectedTextInput,
  replaceTextInput,
  scrollTextInputCaretIntoView,
  selectAllTextInput,
  selectLineAtTextInputIndex,
  selectWordAtTextInputIndex,
  setTextInputSelection,
  undoTextInput,
} from './contract.ts';
import type { HandleTextInputKeyboardOptions, ReplaceTextInputOptions } from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

interface TestRichTextData {
  autoSize: TextAutoSize | undefined;
  background: boolean | undefined;
  backgroundColor: number | undefined;
  border: boolean | undefined;
  borderColor: number | undefined;
  condenseWhite: boolean | undefined;
  defaultTextFormat: TextFormat | undefined;
  height: number | undefined;
  maxChars: number | undefined;
  mouseWheelEnabled: boolean | undefined;
  multiline: boolean | undefined;
  scrollH: number | undefined;
  scrollV: number | undefined;
  selectable: boolean | undefined;
  text: string | undefined;
  textColor: number | undefined;
  textFormat: TextFormat | undefined;
  textFormatRanges: TextFormatRangeRaw[] | undefined;
  verticalAlign: TextVerticalAlign | undefined;
  width: number | undefined;
  wordWrap: boolean | undefined;
}

interface TestRichText {
  data: TestRichTextData | undefined;
}

function createInput(data: TestRichTextData, options: TextInputOptions): RichText {
  const text = createTestRichText({ data: data });
  enableTextInput(text, options);
  return text;
}

function createLayout(): TextLayoutResult {
  const format = formatRef(emptyTextFormat());
  let first = createTextLayoutGroup(format);
  first.startIndex = 0;
  first.endIndex = 3;
  first.ascent = 10.0;
  first.descent = 2.0;
  first.height = 12.0;
  first.lineIndex = 0;
  first.offsetX = 2.0;
  first.offsetY = 2.0;
  first.positions = [10.0, 10.0, 10.0];
  first.width = 30.0;
  let second = createTextLayoutGroup(format);
  second.startIndex = 3;
  second.endIndex = 7;
  second.ascent = 10.0;
  second.descent = 2.0;
  second.height = 12.0;
  second.lineIndex = 1;
  second.offsetX = 2.0;
  second.offsetY = 14.0;
  second.positions = [10.0, 10.0, 10.0, 10.0];
  second.width = 40.0;
  let layout = createTextLayoutResult();
  layout.groups = [first, second];
  layout.lineAscents = [10.0, 10.0];
  layout.lineDescents = [2.0, 2.0];
  layout.lineHeights = [12.0, 12.0];
  layout.lineLeadings = [0.0, 0.0];
  layout.lineWidths = [30.0, 40.0];
  layout.numLines = 2;
  layout.textHeight = 24.0;
  layout.textWidth = 40.0;
  return layout;
}

function createSingleLineLayout(): TextLayoutResult {
  let group = createTextLayoutGroup(formatRef(emptyTextFormat()));
  group.startIndex = 0;
  group.endIndex = 11;
  group.ascent = 10.0;
  group.descent = 2.0;
  group.height = 12.0;
  group.lineIndex = 0;
  group.offsetX = 2.0;
  group.offsetY = 2.0;
  group.positions = new Array(11).fill(10.0);
  group.width = 110.0;
  let layout = createTextLayoutResult();
  layout.groups = [group];
  layout.lineAscents = [10.0];
  layout.lineDescents = [2.0];
  layout.lineHeights = [12.0];
  layout.lineLeadings = [0.0];
  layout.lineWidths = [110.0];
  layout.numLines = 1;
  layout.textHeight = 12.0;
  layout.textWidth = 110.0;
  return layout;
}

function createTallLayout(): TextLayoutResult {
  const format = formatRef(emptyTextFormat());
  let groups: TextLayoutGroup[] = [] as never[];
  for (let line = 0; line < 4; line += 1) {
    let group = createTextLayoutGroup(format);
    group.startIndex = line;
    group.endIndex = line + 1;
    group.ascent = 10.0;
    group.descent = 2.0;
    group.height = 12.0;
    group.lineIndex = line;
    group.offsetX = 2.0;
    group.offsetY = 2.0 + line * 12.0;
    group.positions = [10.0];
    group.width = 10.0;
    groups.push(group);
  }
  let layout = createTextLayoutResult();
  layout.groups = groups;
  layout.lineAscents = new Array(4).fill(10.0);
  layout.lineDescents = new Array(4).fill(2.0);
  layout.lineHeights = new Array(4).fill(12.0);
  layout.lineLeadings = new Array(4).fill(0.0);
  layout.lineWidths = new Array(4).fill(10.0);
  layout.numLines = 4;
  layout.textHeight = 48.0;
  layout.textWidth = 10.0;
  return layout;
}

function emptyTextFormat(): TextFormat {
  return {
    align: undefined,
    blockIndent: undefined,
    bold: undefined,
    bullet: undefined,
    color: undefined,
    font: undefined,
    indent: undefined,
    italic: undefined,
    kerning: undefined,
    leading: undefined,
    leftMargin: undefined,
    letterSpacing: undefined,
    listMarker: undefined,
    rightMargin: undefined,
    size: undefined,
    strikethrough: undefined,
    tabStops: undefined,
    target: undefined,
    underline: undefined,
    url: undefined,
    variations: undefined,
  };
}

function formatRef(format: TextFormat): TextFormat {
  return format;
}

function inputOptions(): TextInputOptions {
  return {
    alwaysShowSelection: undefined,
    caretColor: undefined,
    caretWidth: undefined,
    displayAsPassword: undefined,
    historyLimit: undefined,
    passwordCharacter: undefined,
    restrict: undefined,
    selectionAlpha: undefined,
    selectionColor: undefined,
  };
}

function keyboardData(): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: '',
    ctrlKey: false,
    key: '',
    keyCode: 0,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: false,
    timeStamp: 0.0,
  };
}

function richTextOptions(): TestRichTextData {
  return {
    autoSize: undefined,
    background: undefined,
    backgroundColor: undefined,
    border: undefined,
    borderColor: undefined,
    condenseWhite: undefined,
    defaultTextFormat: undefined,
    height: undefined,
    maxChars: undefined,
    mouseWheelEnabled: undefined,
    multiline: undefined,
    scrollH: undefined,
    scrollV: undefined,
    selectable: undefined,
    text: undefined,
    textColor: undefined,
    textFormat: undefined,
    textFormatRanges: undefined,
    verticalAlign: undefined,
    width: undefined,
    wordWrap: undefined,
  };
}

function runtime(source: RichText): RichTextRuntime {
  source = source!;
  return getRichTextRuntime(source);
}

function setLayout(source: RichText, layout: TextLayoutResult): void {
  const node: NodeRef = source;
  setTextLayoutResult(node, layout);
}

function createTestRichText(obj: Readonly<TestRichText> | undefined): RichText {
  const text = crate.createDefaultRichText();
  {
    const $data = ((obj) => (obj === undefined ? undefined : obj.data))(obj);
    if ($data !== undefined) {
      const data = $data;
      assignTestRichTextData(text!.data, data);
    }
  }
  return text;
}

function assignTestRichTextData(out: RichTextData, data: Readonly<TestRichTextData>): void {
  if (data.autoSize !== undefined) {
    const autoSize = data.autoSize;
    out.autoSize = autoSize;
  }
  if (data.background !== undefined) {
    const background = data.background;
    out.background = background;
  }
  if (data.backgroundColor !== undefined) {
    const backgroundColor = data.backgroundColor;
    out.backgroundColor = backgroundColor;
  }
  if (data.border !== undefined) {
    const border = data.border;
    out.border = border;
  }
  if (data.borderColor !== undefined) {
    const borderColor = data.borderColor;
    out.borderColor = borderColor;
  }
  if (data.condenseWhite !== undefined) {
    const condenseWhite = data.condenseWhite;
    out.condenseWhite = condenseWhite;
  }
  if (data.defaultTextFormat !== undefined) {
    const defaultTextFormat = data.defaultTextFormat;
    out.defaultTextFormat = defaultTextFormat;
  }
  if (data.height !== undefined) {
    const height = data.height;
    out.height = height;
  }
  if (data.maxChars !== undefined) {
    const maxChars = data.maxChars;
    out.maxChars = maxChars;
  }
  if (data.mouseWheelEnabled !== undefined) {
    const mouseWheelEnabled = data.mouseWheelEnabled;
    out.mouseWheelEnabled = mouseWheelEnabled;
  }
  if (data.multiline !== undefined) {
    const multiline = data.multiline;
    out.multiline = multiline;
  }
  if (data.scrollH !== undefined) {
    const scrollH = data.scrollH;
    out.scrollH = scrollH;
  }
  if (data.scrollV !== undefined) {
    const scrollV = data.scrollV;
    out.scrollV = scrollV;
  }
  if (data.selectable !== undefined) {
    const selectable = data.selectable;
    out.selectable = selectable;
  }
  if (data.text !== undefined) {
    const text = data.text;
    out.text = text;
  }
  if (data.textColor !== undefined) {
    const textColor = data.textColor;
    out.textColor = textColor;
  }
  if (data.textFormat !== undefined) {
    const textFormat = data.textFormat;
    out.textFormat = textFormat;
  }
  if (data.textFormatRanges !== undefined) {
    const textFormatRanges = data.textFormatRanges;
    out.textFormatRanges = textFormatRanges;
  }
  if (data.verticalAlign !== undefined) {
    const verticalAlign = data.verticalAlign;
    out.verticalAlign = verticalAlign;
  }
  if (data.width !== undefined) {
    const width = data.width;
    out.width = width;
  }
  if (data.wordWrap !== undefined) {
    const wordWrap = data.wordWrap;
    out.wordWrap = wordWrap;
  }
}

function optionsWithRestrict(restrict: string): TextInputOptions {
  return { ...inputOptions(), restrict: String(restrict) };
}

function textData(text: string): TestRichTextData {
  return { ...richTextOptions(), text: String(text) };
}

describe('appendTextInput', () => {
  it('appends without input restrictions', () => {
    const text = createInput({ ...richTextOptions(), maxChars: 3, text: 'abc' }, inputOptions());
    appendTextInput(text, 'def');
    expect(text!.data.text).toEqual('abcdef');
    expect(getTextInputCaretIndex(text)).toEqual(6);
  });
});

describe('applyTextInputRestriction', () => {
  it('allows accepted ranges', () => {
    const text = createInput(richTextOptions(), optionsWithRestrict('A-Z 0-9'));
    expect(applyTextInputRestriction(text, 'A1a!', 0)).toEqual('A1');
  });
  it('applies max chars to inserted user input', () => {
    const text = createInput({ ...richTextOptions(), maxChars: 5, text: 'abc' }, inputOptions());
    expect(applyTextInputRestriction(text, 'def', 0)).toEqual('de');
  });
  it('declines ranges after a caret', () => {
    const text = createInput(richTextOptions(), optionsWithRestrict('^a-z'));
    expect(applyTextInputRestriction(text, 'Abc1', 0)).toEqual('A1');
  });
  it('removes line breaks for single line input', () => {
    const text = createInput({ ...richTextOptions(), multiline: false }, inputOptions());
    expect(applyTextInputRestriction(text, 'a\nb\rc', 0)).toEqual('abc');
  });
  it('supports escaping literal carets and hyphens', () => {
    const text = createInput(richTextOptions(), optionsWithRestrict('\\-\\^'));
    expect(applyTextInputRestriction(text, '-^A', 0)).toEqual('-^');
  });
});

describe('canRedoTextInput', () => {
  it('returns false when nothing has been undone', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    expect(!canRedoTextInput(text)).toBe(true);
  });
  it('returns true after an edit has been undone', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    undoTextInput(text);
    expect(canRedoTextInput(text)).toBe(true);
  });
});

describe('canUndoTextInput', () => {
  it('returns false on a freshly enabled field with no edits', () => {
    expect(!canUndoTextInput(createInput(textData('abc'), inputOptions()))).toBe(true);
  });
  it('returns true after a recorded edit', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    expect(canUndoTextInput(text)).toBe(true);
  });
});

describe('clearTextInputHistory', () => {
  it('empties the history and resets the cursor without changing text', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    clearTextInputHistory(text);
    expect(!canUndoTextInput(text)).toBe(true);
    expect(!canRedoTextInput(text)).toBe(true);
    expect(text!.data.text).toEqual('Xabc');
  });
});

describe('deleteTextInputBackward', () => {
  it('deletes the previous character for a collapsed selection', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 2, 2);
    deleteTextInputBackward(text);
    expect(text!.data.text).toEqual('ac');
    expect(getTextInputCaretIndex(text)).toEqual(1);
  });
  it('deletes the previous grapheme without splitting utf16', () => {
    const text = createInput(textData('a👨\u{200d}👩\u{200d}👧\u{200d}👦b'), inputOptions());
    setTextInputSelection(text, 12, 12);
    deleteTextInputBackward(text);
    expect(text!.data.text).toEqual('ab');
    expect(getTextInputCaretIndex(text)).toEqual(1);
  });
  it('deletes the selected range', () => {
    const text = createInput(textData('abcd'), inputOptions());
    setTextInputSelection(text, 1, 3);
    deleteTextInputBackward(text);
    expect(text!.data.text).toEqual('ad');
  });
});

describe('deleteTextInputForward', () => {
  it('deletes the next character for a collapsed selection', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 1, 1);
    deleteTextInputForward(text);
    expect(text!.data.text).toEqual('ac');
  });
  it('deletes the next grapheme without splitting utf16', () => {
    const text = createInput(textData('a👍🏽b'), inputOptions());
    setTextInputSelection(text, 1, 1);
    deleteTextInputForward(text);
    expect(text!.data.text).toEqual('ab');
  });
});

describe('deleteTextInputWordBackward', () => {
  it('deletes across whitespace to reach the prior word', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 6, 6);
    deleteTextInputWordBackward(text);
    expect(text!.data.text).toEqual('world');
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
  it('deletes the selected range instead of a word', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 0, 5);
    deleteTextInputWordBackward(text);
    expect(text!.data.text).toEqual(' world');
  });
  it('deletes the word before the caret', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 11, 11);
    deleteTextInputWordBackward(text);
    expect(text!.data.text).toEqual('hello ');
    expect(getTextInputCaretIndex(text)).toEqual(6);
  });
  it('does nothing at the beginning of text', () => {
    const text = createInput(textData('abc'), inputOptions());
    deleteTextInputWordBackward(text);
    expect(text!.data.text).toEqual('abc');
  });
});

describe('deleteTextInputWordForward', () => {
  it('deletes the selected range instead of a word', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 6, 11);
    deleteTextInputWordForward(text);
    expect(text!.data.text).toEqual('hello ');
  });
  it('deletes the word after the caret', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 6, 6);
    deleteTextInputWordForward(text);
    expect(text!.data.text).toEqual('hello ');
    expect(getTextInputCaretIndex(text)).toEqual(6);
  });
  it('does nothing at the end of text', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 3, 3);
    deleteTextInputWordForward(text);
    expect(text!.data.text).toEqual('abc');
  });
});

describe('getTextInputCaretIndex', () => {
  it('clamps the runtime caret to text length', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 0, 99);
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
});

describe('getTextInputCaretRectangle', () => {
  it('writes a caret rectangle from the layout group', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    let out = { height: 0.0, lineIndex: 0, width: 0.0, x: 0.0, y: 0.0 };
    setTextInputSelection(text, 2, 2);
    getTextInputCaretRectangle(out, text, createLayout());
    expect(out).toEqual({ height: 12.0, lineIndex: 0, width: 1.0, x: 22.0, y: 2.0 });
  });
});

describe('getTextInputCharacterIndexAtPoint', () => {
  it('returns the nearest character index on a line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    expect(getTextInputCharacterIndexAtPoint(text, createLayout(), 27.0, 3.0)).toEqual(3);
  });
  it('selects the closest line by y', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    expect(getTextInputCharacterIndexAtPoint(text, createLayout(), 2.0, 20.0)).toEqual(3);
  });
});

describe('getTextInputDisplayText', () => {
  it('returns password characters when display as password is enabled', () => {
    const text = createInput(textData('secret'), {
      ...inputOptions(),
      displayAsPassword: true,
      passwordCharacter: '*',
    });
    expect(getTextInputDisplayText(text)).toEqual('******');
  });
  it('returns plain text by default', () => {
    const text = createInput(textData('secret'), inputOptions());
    expect(getTextInputDisplayText(text)).toEqual('secret');
  });
});

describe('getTextInputSelectionBeginIndex', () => {
  it('returns the lower selected index', () => {
    const text = createInput(textData('abcd'), inputOptions());
    setTextInputSelection(text, 3, 1);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(1);
  });
});

describe('getTextInputSelectionEndIndex', () => {
  it('returns the higher selected index', () => {
    const text = createInput(textData('abcd'), inputOptions());
    setTextInputSelection(text, 3, 1);
    expect(getTextInputSelectionEndIndex(text)).toEqual(3);
  });
});

describe('getTextInputSelectionRectangles', () => {
  it('writes one rectangle per selected layout group', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    let out: TextSelectionRectangle[] = [] as never[];
    setTextInputSelection(text, 1, 5);
    getTextInputSelectionRectangles(out, text, createLayout());
    expect(out).toEqual([
      { height: 12.0, lineIndex: 0, width: 20.0, x: 12.0, y: 2.0 },
      { height: 12.0, lineIndex: 1, width: 20.0, x: 2.0, y: 14.0 },
    ]);
  });
});

describe('getTextInputSelectionText', () => {
  it('returns empty string for a collapsed selection', () => {
    const text = createInput(textData('hello'), inputOptions());
    setTextInputSelection(text, 2, 2);
    expect(getTextInputSelectionText(text)).toEqual('');
  });
  it('returns the selected slice of text', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 6, 11);
    expect(getTextInputSelectionText(text)).toEqual('world');
  });
  it('slices by utf16 code unit offsets', () => {
    const text = createInput(textData('a😀b'), inputOptions());
    setTextInputSelection(text, 1, 3);
    expect(getTextInputSelectionText(text)).toEqual('😀');
  });
});

describe('handleTextInputKeyboard', () => {
  function layoutOptions(): HandleTextInputKeyboardOptions {
    return { clipboardText: undefined, layout: createLayout(), onCopy: undefined };
  }
  it('ctrl end moves to document end', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'End';
    data.keyCode = KEY_CODE_END;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text)).toEqual(7);
  });
  it('ctrl home moves to document start', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 6, 6);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'Home';
    data.keyCode = KEY_CODE_HOME;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
  it('end moves to the end of the current line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.key = 'End';
    data.keyCode = KEY_CODE_END;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
  it('extends selection when shift is held', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.key = 'ArrowRight';
    data.keyCode = KEY_CODE_RIGHT;
    data.shiftKey = true;
    handleTextInputKeyboard(text, data, undefined);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(1);
    expect(getTextInputSelectionEndIndex(text)).toEqual(2);
  });
  it('handles arrow movement', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 2, 2);
    let data = keyboardData();
    data.key = 'ArrowLeft';
    data.keyCode = KEY_CODE_LEFT;
    expect(handleTextInputKeyboard(text, data, undefined)).toBe(true);
    expect(getTextInputCaretIndex(text)).toEqual(1);
  });
  it('handles backspace', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 2, 2);
    let data = keyboardData();
    data.key = 'Backspace';
    data.keyCode = KEY_CODE_BACKSPACE;
    handleTextInputKeyboard(text, data, undefined);
    expect(text!.data.text).toEqual('ac');
  });
  it('handles ctrl a selection', () => {
    const text = createInput(textData('abc'), inputOptions());
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'a';
    data.keyCode = KEY_CODE_A;
    handleTextInputKeyboard(text, data, undefined);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(3);
  });
  it('handles ctrl backspace word delete backward', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 11, 11);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'Backspace';
    data.keyCode = KEY_CODE_BACKSPACE;
    handleTextInputKeyboard(text, data, undefined);
    expect(text!.data.text).toEqual('hello ');
  });
  it('handles ctrl delete word delete forward', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 6, 6);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'Delete';
    data.keyCode = KEY_CODE_DELETE;
    handleTextInputKeyboard(text, data, undefined);
    expect(text!.data.text).toEqual('hello ');
  });
  it('handles ctrl left word left motion', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 11, 11);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'ArrowLeft';
    data.keyCode = KEY_CODE_LEFT;
    handleTextInputKeyboard(text, data, undefined);
    expect(getTextInputCaretIndex(text)).toEqual(6);
  });
  it('handles ctrl right word right motion', () => {
    const text = createInput(textData('hello world'), inputOptions());
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'ArrowRight';
    data.keyCode = KEY_CODE_RIGHT;
    handleTextInputKeyboard(text, data, undefined);
    expect(getTextInputCaretIndex(text)).toEqual(5);
  });
  it('handles down arrow with layout', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.key = 'ArrowDown';
    data.keyCode = KEY_CODE_DOWN;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text) >= 3).toBe(true);
  });
  it('handles down at last line by moving to end', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 5, 5);
    let data = keyboardData();
    data.key = 'ArrowDown';
    data.keyCode = KEY_CODE_DOWN;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text)).toEqual(7);
  });
  it('handles paste using input restrictions', () => {
    const text = createInput(textData('a'), optionsWithRestrict('0-9'));
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'v';
    data.keyCode = KEY_CODE_V;
    const options: HandleTextInputKeyboardOptions = { clipboardText: 'b23', layout: undefined, onCopy: undefined };
    handleTextInputKeyboard(text, data, options);
    expect(text!.data.text).toEqual('a23');
  });
  it('handles up arrow with layout', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 5, 5);
    let data = keyboardData();
    data.key = 'ArrowUp';
    data.keyCode = KEY_CODE_UP;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text) <= 3).toBe(true);
  });
  it('handles up at first line by moving to start', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.key = 'ArrowUp';
    data.keyCode = KEY_CODE_UP;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
  it('home moves to the start of the current line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 6, 6);
    let data = keyboardData();
    data.key = 'Home';
    data.keyCode = KEY_CODE_HOME;
    handleTextInputKeyboard(text, data, layoutOptions());
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
  it('inserts returns only for multiline input', () => {
    const text = createInput({ ...richTextOptions(), multiline: true, text: 'a' }, inputOptions());
    setTextInputSelection(text, 1, 1);
    let data = keyboardData();
    data.key = 'Enter';
    data.keyCode = KEY_CODE_RETURN;
    expect(handleTextInputKeyboard(text, data, undefined)).toBe(true);
    expect(text!.data.text).toEqual('a\n');
  });
  it('invokes on copy callback for copy command', () => {
    const text = createInput(textData('hello'), inputOptions());
    setTextInputSelection(text, 0, 5);
    const copied: { value: string[] } = { value: [] as never[] };
    const callbackValues = copied;
    const options: HandleTextInputKeyboardOptions = {
      clipboardText: undefined,
      layout: undefined,
      onCopy: (value) => {
        callbackValues.value.push(String(value));
      },
    };
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'c';
    data.keyCode = KEY_CODE_C;
    handleTextInputKeyboard(text, data, options);
    expect(copied.value).toEqual(['hello']);
  });
  it('returns false for unhandled keys', () => {
    const text = createInput(textData('abc'), inputOptions());
    let data = keyboardData();
    data.key = 'F1';
    data.keyCode = 112;
    expect(!handleTextInputKeyboard(text, data, undefined)).toBe(true);
  });
});

describe('insertTextInput', () => {
  it('replaces the current selection using input restrictions', () => {
    const text = createInput(textData('ab'), optionsWithRestrict('0-9'));
    setTextInputSelection(text, 1, 1);
    insertTextInput(text, 'c3');
    expect(text!.data.text).toEqual('a3b');
  });
});

describe('moveTextInputCaret', () => {
  it('moves and collapses selection by default', () => {
    const text = createInput(textData('abc'), inputOptions());
    moveTextInputCaret(text, 2, false);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(2);
    expect(getTextInputSelectionEndIndex(text)).toEqual(2);
  });
  it('resets desired caret x on horizontal move', () => {
    const text = createInput(textData('abc'), inputOptions());
    const state = getTextInputState(text)!;
    state!.desiredCaretX = 50.0;
    moveTextInputCaret(text, 1, false);
    expect(state!.desiredCaretX).toEqual(-1.0);
  });
});

describe('moveTextInputCaretByWord', () => {
  it('clamps to text end when moving forward past the end', () => {
    const text = createInput(textData('hi'), inputOptions());
    setTextInputSelection(text, 2, 2);
    moveTextInputCaretByWord(text, 1, false);
    expect(getTextInputCaretIndex(text)).toEqual(2);
  });
  it('clamps to text start when moving backward past the beginning', () => {
    const text = createInput(textData('hi'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretByWord(text, -1, false);
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
  it('extends selection when extend selection is true', () => {
    const text = createInput(textData('hello world'), inputOptions());
    moveTextInputCaretByWord(text, 1, true);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(5);
  });
  it('moves backward by one word', () => {
    const text = createInput(textData('hello world'), inputOptions());
    setTextInputSelection(text, 11, 11);
    moveTextInputCaretByWord(text, -1, false);
    expect(getTextInputCaretIndex(text)).toEqual(6);
  });
  it('moves forward by one word', () => {
    const text = createInput(textData('hello world'), inputOptions());
    moveTextInputCaretByWord(text, 1, false);
    expect(getTextInputCaretIndex(text)).toEqual(5);
  });
});

describe('moveTextInputCaretDown', () => {
  it('extends selection when extend selection is true', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretDown(text, createLayout(), true);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(1);
    expect(getTextInputSelectionEndIndex(text) > 1).toBe(true);
  });
  it('falls back to end of text when layout is none', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretDown(text, undefined, false);
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
  it('moves caret to the next line at the same x', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretDown(text, createLayout(), false);
    expect(getTextInputCaretIndex(text) >= 3).toBe(true);
  });
  it('moves to end of text when already on the last line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 5, 5);
    moveTextInputCaretDown(text, createLayout(), false);
    expect(getTextInputCaretIndex(text)).toEqual(7);
  });
  it('preserves desired caret x across consecutive down moves', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    const state = getTextInputState(text)!;
    moveTextInputCaretDown(text, createLayout(), false);
    expect(state!.desiredCaretX).not.toEqual(-1.0);
  });
});

describe('moveTextInputCaretToLineEnd', () => {
  it('extends selection when extend selection is true', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretToLineEnd(text, createLayout(), true);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(1);
    expect(getTextInputSelectionEndIndex(text)).toEqual(3);
  });
  it('falls back to end of text when layout is none', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretToLineEnd(text, undefined, false);
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
  it('moves the caret to the end of the current layout line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretToLineEnd(text, createLayout(), false);
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
});

describe('moveTextInputCaretToLineStart', () => {
  it('extends selection when extend selection is true', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 6, 6);
    moveTextInputCaretToLineStart(text, createLayout(), true);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(3);
    expect(getTextInputSelectionEndIndex(text)).toEqual(6);
  });
  it('falls back to start of text when layout is none', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 2, 2);
    moveTextInputCaretToLineStart(text, undefined, false);
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
  it('moves the caret to the start of the current layout line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 6, 6);
    moveTextInputCaretToLineStart(text, createLayout(), false);
    expect(getTextInputCaretIndex(text)).toEqual(3);
  });
});

describe('moveTextInputCaretUp', () => {
  it('falls back to start of text when layout is none', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 2, 2);
    moveTextInputCaretUp(text, undefined, false);
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
  it('moves caret to the previous line at the same x', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 5, 5);
    moveTextInputCaretUp(text, createLayout(), false);
    expect(getTextInputCaretIndex(text) <= 3).toBe(true);
  });
  it('moves to start of text when already on the first line', () => {
    const text = createInput(textData('abcdefg'), inputOptions());
    setTextInputSelection(text, 1, 1);
    moveTextInputCaretUp(text, createLayout(), false);
    expect(getTextInputCaretIndex(text)).toEqual(0);
  });
});

describe('redoTextInput', () => {
  it('does nothing when there is nothing to redo', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    redoTextInput(text);
    expect(text!.data.text).toEqual('Xabc');
  });
  it('reapplies an undone edit', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    undoTextInput(text);
    redoTextInput(text);
    expect(text!.data.text).toEqual('Xabc');
  });
  it('restores the caret position recorded after the edit', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    undoTextInput(text);
    redoTextInput(text);
    expect(getTextInputCaretIndex(text)).toEqual(1);
  });
});

describe('replaceSelectedTextInput', () => {
  it('can apply input restrictions for user input paths', () => {
    const text = createInput({ ...richTextOptions(), maxChars: 4, text: 'ab' }, optionsWithRestrict('0-9'));
    setTextInputSelection(text, 1, 1);
    const options: ReplaceTextInputOptions = { applyInputRules: true, mergeKind: undefined, skipHistory: undefined };
    replaceSelectedTextInput(text, 'c345', options);
    expect(text!.data.text).toEqual('a34b');
  });
  it('does not apply input restrictions by default', () => {
    const text = createInput({ ...richTextOptions(), maxChars: 3, text: 'abc' }, optionsWithRestrict('0-9'));
    setTextInputSelection(text, 1, 2);
    replaceSelectedTextInput(text, 'XYZ', undefined);
    expect(text!.data.text).toEqual('aXYZc');
  });
});

describe('replaceTextInput', () => {
  it('replaces a range and collapses selection after inserted text', () => {
    const text = createInput(textData('hello world'), inputOptions());
    const before = getNodeAppearanceRevision(text!);
    replaceTextInput(text, 6, 11, 'Flight', undefined);
    expect(text!.data.text).toEqual('hello Flight');
    expect(getTextInputSelectionBeginIndex(text)).toEqual(12);
    expect(getTextInputSelectionEndIndex(text)).toEqual(12);
    expect(getNodeAppearanceRevision(text!)).not.toEqual(before);
  });
  it('updates serialized text format ranges after insertion', () => {
    const text = createInput(textData('abcd'), inputOptions());
    let bold = emptyTextFormat();
    bold.bold = true;
    setRichTextFormatRange(text, formatRef(bold), 0, 4);
    replaceTextInput(text, 2, 2, 'XY', undefined);
    const source = text!;
    expect(source.data.textFormatRanges.length).toEqual(1);
    const range = source.data.textFormatRanges[0];
    expect([range.start, range.end]).toEqual([0, 6]);
    expect(range.format!.bold).toEqual(true);
  });
  it('updates serialized text format ranges after replacement', () => {
    const text = createInput(textData('abcd'), inputOptions());
    let bold = emptyTextFormat();
    bold.bold = true;
    let italic = emptyTextFormat();
    italic.italic = true;
    setRichTextFormatRange(text, formatRef(bold), 0, 2);
    setRichTextFormatRange(text, formatRef(italic), 2, 4);
    replaceTextInput(text, 1, 3, 'Z', undefined);
    const source = text!;
    expect(source.data.textFormatRanges.length).toEqual(2);
    const first = source.data.textFormatRanges[0];
    const second = source.data.textFormatRanges[1];
    expect([first.start, first.end]).toEqual([0, 1]);
    expect(first.format!.bold).toEqual(true);
    expect([second.start, second.end]).toEqual([1, 3]);
    expect(second.format!.italic).toEqual(true);
  });
});

describe('scrollTextInputCaretIntoView', () => {
  it('leaves scroll unchanged when the caret is already visible', () => {
    const text = createInput(
      { ...richTextOptions(), height: 60.0, multiline: true, text: 'abcd', width: 100.0 },
      inputOptions(),
    );
    scrollTextInputCaretIntoView(text, createTallLayout(), 100.0, 60.0);
    expect(text!.data.scrollV).toEqual(1.0);
    expect(text!.data.scrollH).toEqual(0.0);
  });
  it('scrolls down so a caret below the viewport becomes visible', () => {
    const text = createInput(
      { ...richTextOptions(), height: 28.0, multiline: true, text: 'abcd', width: 100.0 },
      inputOptions(),
    );
    setTextInputSelection(text, 4, 4);
    scrollTextInputCaretIntoView(text, createTallLayout(), 100.0, 24.0);
    expect(text!.data.scrollV > 1.0).toBe(true);
  });
  it('scrolls horizontally so a caret past the right edge becomes visible', () => {
    const text = createInput({ ...richTextOptions(), height: 40.0, text: 'abcdefg', width: 20.0 }, inputOptions());
    setTextInputSelection(text, 7, 7);
    scrollTextInputCaretIntoView(text, createLayout(), 20.0, 40.0);
    expect(text!.data.scrollH > 0.0).toBe(true);
  });
});

describe('selectAllTextInput', () => {
  it('selects the full input text range', () => {
    const text = createInput(textData('abc'), inputOptions());
    selectAllTextInput(text);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(3);
  });
});

describe('selectLineAtTextInputIndex', () => {
  it('selects empty range for empty text', () => {
    const text = createInput(textData(''), inputOptions());
    selectLineAtTextInputIndex(text, 0);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(0);
  });
  it('selects from the start to the end of the line', () => {
    const text = createInput(textData('hello\nworld'), inputOptions());
    selectLineAtTextInputIndex(text, 8);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(6);
    expect(getTextInputSelectionEndIndex(text)).toEqual(11);
  });
  it('selects the correct line in multiline text', () => {
    const text = createInput(textData('aaa\nbbb\nccc'), inputOptions());
    selectLineAtTextInputIndex(text, 5);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(4);
    expect(getTextInputSelectionEndIndex(text)).toEqual(7);
  });
  it('selects the first line when index is at a line boundary', () => {
    const text = createInput(textData('hello\nworld'), inputOptions());
    selectLineAtTextInputIndex(text, 5);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(5);
  });
  it('selects the last line', () => {
    const text = createInput(textData('aaa\nbbb\nccc'), inputOptions());
    selectLineAtTextInputIndex(text, 10);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(8);
    expect(getTextInputSelectionEndIndex(text)).toEqual(11);
  });
});

describe('selectWordAtTextInputIndex', () => {
  it('selects empty range for empty text', () => {
    const text = createInput(textData(''), inputOptions());
    selectWordAtTextInputIndex(text, 0);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(0);
  });
  it('selects non word region when surrounded by non word characters', () => {
    const text = createInput(textData('  hello'), inputOptions());
    selectWordAtTextInputIndex(text, 1);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(2);
  });
  it('selects the preceding word when index is at a whitespace boundary', () => {
    const text = createInput(textData('hello world'), inputOptions());
    selectWordAtTextInputIndex(text, 5);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(5);
  });
  it('selects the preceding word when index is at punctuation', () => {
    const text = createInput(textData('hello, world'), inputOptions());
    selectWordAtTextInputIndex(text, 5);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(5);
  });
  it('selects the word at the given index', () => {
    const text = createInput(textData('hello world'), inputOptions());
    selectWordAtTextInputIndex(text, 1);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(5);
  });
  it('selects unicode words using utf16 offsets', () => {
    const text = createInput(textData('hi 世界'), inputOptions());
    selectWordAtTextInputIndex(text, 3);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(3);
    const end = getTextInputSelectionEndIndex(text);
    expect(end >= 4).toBe(true);
    expect(end <= 5).toBe(true);
  });
  it('selects word at end of text', () => {
    const text = createInput(textData('hello world'), inputOptions());
    selectWordAtTextInputIndex(text, 11);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(6);
    expect(getTextInputSelectionEndIndex(text)).toEqual(11);
  });
  it('selects word at start of text', () => {
    const text = createInput(textData('hello world'), inputOptions());
    selectWordAtTextInputIndex(text, 0);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(5);
  });
});

describe('setTextInputSelection', () => {
  it('clamps selection to the text range', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, -10, 10);
    expect(getTextInputSelectionBeginIndex(text)).toEqual(0);
    expect(getTextInputSelectionEndIndex(text)).toEqual(3);
  });
});

describe('undoTextInput', () => {
  function replaceOptions(mergeKind: string | undefined): ReplaceTextInputOptions {
    return {
      applyInputRules: undefined,
      mergeKind: ((value) => (value === undefined ? undefined : String(value)))(mergeKind),
      skipHistory: undefined,
    };
  }
  it('coalesces consecutive edits sharing a non null merge kind', () => {
    const text = createInput(textData(''), inputOptions());
    replaceTextInput(text, 0, 0, 'a', replaceOptions('type'));
    replaceTextInput(text, 1, 1, 'b', replaceOptions('type'));
    undoTextInput(text);
    expect(text!.data.text).toEqual('');
  });
  it('does nothing when there is nothing to undo', () => {
    const text = createInput(textData('abc'), inputOptions());
    undoTextInput(text);
    expect(text!.data.text).toEqual('abc');
  });
  it('does not record history when history limit is zero', () => {
    const text = createInput(textData('abc'), { ...inputOptions(), historyLimit: 0 });
    insertTextInput(text, 'X');
    expect(!canUndoTextInput(text)).toBe(true);
    undoTextInput(text);
    expect(text!.data.text).toEqual('Xabc');
  });
  it('restores the caret position recorded before the edit', () => {
    const text = createInput(textData('abc'), inputOptions());
    setTextInputSelection(text, 1, 1);
    insertTextInput(text, 'X');
    expect(getTextInputCaretIndex(text)).toEqual(2);
    undoTextInput(text);
    expect(getTextInputCaretIndex(text)).toEqual(1);
  });
  it('restores the text before the most recent edit', () => {
    const text = createInput(textData('abc'), inputOptions());
    insertTextInput(text, 'X');
    undoTextInput(text);
    expect(text!.data.text).toEqual('abc');
  });
  it('walks back through multiple non merged edits in order', () => {
    const text = createInput(textData(''), inputOptions());
    replaceTextInput(text, 0, 0, 'a', replaceOptions(undefined));
    replaceTextInput(text, 1, 1, 'b', replaceOptions(undefined));
    undoTextInput(text);
    expect(text!.data.text).toEqual('a');
    undoTextInput(text);
    expect(text!.data.text).toEqual('');
  });
});
