// Generated from crates/flight-textinput/tests/text_input_manager_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { KEY_CODE_BACKSPACE, KEY_CODE_C, KEY_CODE_END, KEY_CODE_HOME } from '@flighthq/input/contract';
import type { InputKeyboardData, InputTextData } from '@flighthq/input/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import { getRichTextRuntime, setTextLayoutResult } from '@flighthq/text/contract';
import type { RichText, RichTextData, RichTextRuntime, TextInputOptions } from '@flighthq/text/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import { createTextLayoutGroup, createTextLayoutResult } from '@flighthq/textlayout/contract';
import type { TextAutoSize, TextLayoutGroup, TextLayoutResult, TextVerticalAlign } from '@flighthq/textlayout/contract';
import { describe, expect, it } from 'vitest';

import {
  blurTextInput,
  connectInputToTextInput,
  createTextInputManager,
  dispatchTextInput,
  dispatchTextInputKeyDown,
  dispatchTextInputPointerDown,
  dispatchTextInputPointerMove,
  dispatchTextInputWheel,
  focusTextInput,
  getTextInputCaretIndex,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputState,
  initializeTextInputManager,
  setTextInputSelection,
} from './contract.ts';
import type { TextInputSource } from './contract.ts';
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

function isFocused(target: RichText): boolean {
  return ((state) => (state === null ? null : state!.focused))(getTextInputState(target)) ?? false;
}

function textData(text: string): TestRichTextData {
  return { ...richTextOptions(), text: String(text) };
}

describe('blurTextInput', () => {
  it('clears the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput(richTextOptions(), inputOptions());
    focusTextInput(manager, target);
    expect(isFocused(target)).toBe(true);
    blurTextInput(manager);
    expect(manager!.focused === null).toBe(true);
    expect(!isFocused(target)).toBe(true);
  });
});

describe('connectInputToTextInput', () => {
  it('routes normalized text input into the focused target', () => {
    const input: TextInputSource = { onKeyDown: createSignal(), onTextInput: createSignal() };
    const manager = createTextInputManager();
    const target = createInput(richTextOptions(), inputOptions());
    focusTextInput(manager, target);
    const disconnect = connectInputToTextInput(input, manager);
    emitSignal(input.onTextInput, { isComposing: false, text: 'A' });
    expect(target!.data.text).toEqual('A');
    disconnect();
    emitSignal(input.onTextInput, { isComposing: false, text: 'B' });
    expect(target!.data.text).toEqual('A');
  });
});

describe('createTextInputManager', () => {
  it('creates an enabled manager without focus', () => {
    const manager = createTextInputManager();
    expect(manager!.enabled).toBe(true);
    expect(manager!.focused === null).toBe(true);
  });
});

describe('dispatchTextInput', () => {
  it('inserts text into the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput(richTextOptions(), inputOptions());
    focusTextInput(manager, target);
    expect(dispatchTextInput(manager, 'x')).toBe(true);
    expect(target!.data.text).toEqual('x');
  });
  it('returns false without focus', () => {
    expect(!dispatchTextInput(createTextInputManager(), 'x')).toBe(true);
  });
});

describe('dispatchTextInputKeyDown', () => {
  it('invokes on copy callback for copy command', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello'), inputOptions());
    setTextInputSelection(target, 0, 5);
    focusTextInput(manager, target);
    const copied: { value: string[] } = { value: [] as never[] };
    const callbackValues = copied;
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'c';
    data.keyCode = KEY_CODE_C;
    dispatchTextInputKeyDown(manager, data, undefined, (value) => {
      callbackValues.value.push(String(value));
    });
    expect(copied.value).toEqual(['hello']);
  });
  it('routes keyboard commands into the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('abc'), inputOptions());
    setTextInputSelection(target, 2, 2);
    focusTextInput(manager, target);
    let data = keyboardData();
    data.key = 'Backspace';
    data.keyCode = KEY_CODE_BACKSPACE;
    expect(dispatchTextInputKeyDown(manager, data, undefined, undefined)).toBe(true);
    expect(target!.data.text).toEqual('ac');
  });
  it('uses the focused target layout for line relative home and end', () => {
    const manager = createTextInputManager();
    const target = createInput({ ...richTextOptions(), multiline: true, text: 'abcdefg' }, inputOptions());
    setLayout(target, createLayout());
    focusTextInput(manager, target);
    setTextInputSelection(target, 6, 6);
    let home = keyboardData();
    home.key = 'Home';
    home.keyCode = KEY_CODE_HOME;
    dispatchTextInputKeyDown(manager, home, undefined, undefined);
    expect(getTextInputCaretIndex(target)).toEqual(3);
    setTextInputSelection(target, 1, 1);
    let end = keyboardData();
    end.key = 'End';
    end.keyCode = KEY_CODE_END;
    dispatchTextInputKeyDown(manager, end, undefined, undefined);
    expect(getTextInputCaretIndex(target)).toEqual(3);
  });
});

describe('dispatchTextInputPointerDown', () => {
  it('focuses the target', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello'), inputOptions());
    dispatchTextInputPointerDown(manager, target, 0.0, 0.0, false, 1);
    expect(manager!.focused! === target).toBe(true);
    expect(isFocused(target)).toBe(true);
  });
  it('selects a line on triple click', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello world'), inputOptions());
    setLayout(target, createSingleLineLayout());
    dispatchTextInputPointerDown(manager, target, 7.0, 5.0, false, 3);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(0);
    expect(getTextInputSelectionEndIndex(target)).toEqual(11);
  });
  it('selects a word on double click', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello world'), inputOptions());
    setLayout(target, createSingleLineLayout());
    dispatchTextInputPointerDown(manager, target, 7.0, 5.0, false, 2);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(0);
    expect(getTextInputSelectionEndIndex(target)).toEqual(5);
  });
});

describe('dispatchTextInputPointerMove', () => {
  it('clamps selection at text boundaries', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello world'), inputOptions());
    setLayout(target, createSingleLineLayout());
    dispatchTextInputPointerDown(manager, target, 53.0, 5.0, false, 1);
    dispatchTextInputPointerMove(manager, 999.0, 5.0);
    expect(getTextInputSelectionEndIndex(target)).toEqual(11);
    dispatchTextInputPointerMove(manager, -100.0, 5.0);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(0);
  });
  it('does not panic when nothing is focused', () => {
    dispatchTextInputPointerMove(createTextInputManager(), 0.0, 0.0);
  });
  it('extends selection backward when pointer moves left', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello world'), inputOptions());
    setLayout(target, createSingleLineLayout());
    dispatchTextInputPointerDown(manager, target, 73.0, 5.0, false, 1);
    dispatchTextInputPointerMove(manager, 23.0, 5.0);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(2);
    expect(getTextInputSelectionEndIndex(target)).toEqual(7);
  });
  it('extends selection when dragging after pointer down', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello world'), inputOptions());
    setLayout(target, createSingleLineLayout());
    dispatchTextInputPointerDown(manager, target, 23.0, 5.0, false, 1);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(2);
    expect(getTextInputSelectionEndIndex(target)).toEqual(2);
    dispatchTextInputPointerMove(manager, 73.0, 5.0);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(2);
    expect(getTextInputSelectionEndIndex(target)).toEqual(7);
  });
});

describe('dispatchTextInputWheel', () => {
  it('advances scroll v by the given delta', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('hello'), inputOptions());
    focusTextInput(manager, target);
    expect(target!.data.scrollV).toEqual(1.0);
    dispatchTextInputWheel(manager, 2.0);
    expect(target!.data.scrollV).toEqual(3.0);
  });
  it('does not panic when nothing is focused', () => {
    dispatchTextInputWheel(createTextInputManager(), 1.0);
  });
});

describe('focusTextInput', () => {
  it('clears focus from the previous target', () => {
    const manager = createTextInputManager();
    const first = createInput(richTextOptions(), inputOptions());
    const second = createInput(richTextOptions(), inputOptions());
    focusTextInput(manager, first);
    focusTextInput(manager, second);
    expect(!isFocused(first)).toBe(true);
    expect(isFocused(second)).toBe(true);
  });
  it('sets the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput(textData('abc'), inputOptions());
    focusTextInput(manager, target);
    expect(manager!.focused! === target).toBe(true);
    expect(isFocused(target)).toBe(true);
    expect(getTextInputSelectionBeginIndex(target)).toEqual(0);
    expect(getTextInputSelectionEndIndex(target)).toEqual(0);
  });
});

describe('initializeTextInputManager', () => {
  it('is the construction initializer of create text input manager', () => {
    const manager = createTextInputManager();
    manager!.enabled = false;
    manager!.focused = createInput(textData('focused'), inputOptions());
    initializeTextInputManager(manager!);
    expect(manager!.enabled).toBe(true);
    expect(manager!.focused === null).toBe(true);
  });
});
