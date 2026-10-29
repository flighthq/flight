// Generated from crates/flight-textinput/tests/selectable_rich_text_manager_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { KEY_CODE_A, KEY_CODE_C } from '@flighthq/input/contract';
import type { InputKeyboardData } from '@flighthq/input/contract';
import { createRichText, getRichTextRuntime } from '@flighthq/text/contract';
import type {
  RichText,
  RichTextData,
  RichTextRuntime,
  TextInputOptions,
  TextLayoutContext,
} from '@flighthq/text/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import { enableTextInput } from '@flighthq/textinput/contract';
import { createTextLayoutGroup, createTextLayoutResult } from '@flighthq/textlayout/contract';
import type { TextAutoSize, TextLayoutResult, TextVerticalAlign } from '@flighthq/textlayout/contract';
import { describe, expect, it } from 'vitest';

import {
  allocateEntity,
  blurSelectableRichText,
  createSelectableRichTextManager,
  dispatchSelectableRichTextKeyDown,
  dispatchSelectableRichTextPointerDown,
  dispatchSelectableRichTextPointerMove,
  dispatchSelectableRichTextWheel,
  focusSelectableRichText,
  getSelectableRichTextSelectionText,
  initializeSelectableRichTextManager,
} from './contract.ts';
import type { SelectableRichTextManagerRaw } from './contract.ts';

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
  layoutContext: TextLayoutContext | undefined;
}

function createInput(data: TestRichTextData, options: TextInputOptions): RichText {
  const text = createTestRichText({ data: data, layoutContext: undefined });
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
  let groups = [] as never[];
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
  const richTextRuntime = runtime(source);
  const textLabel = richTextRuntime!.textLabel;
  textLabel!.textLayout = layout;
}

function createTestRichText(obj: Readonly<TestRichText> | undefined): RichText {
  const text = createRichText(((obj) => (obj === undefined ? undefined : obj.layoutContext))(obj));
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

function richText(text: string): RichText {
  return createTestRichText({ data: { ...richTextOptions(), text: String(text) }, layoutContext: undefined });
}

describe('blurSelectableRichText', () => {
  it('clears the focused target and resets selection', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello');
    focusSelectableRichText(manager, text);
    const richTextRuntime = runtime(text);
    richTextRuntime!.selectionBeginIndex = 1;
    richTextRuntime!.selectionEndIndex = 4;
    blurSelectableRichText(manager);
    expect(manager!.focused === undefined).toBe(true);
    expect(richTextRuntime!.selectionBeginIndex).toEqual(0);
    expect(richTextRuntime!.selectionEndIndex).toEqual(0);
  });
  it('does not panic when nothing is focused', () => {
    blurSelectableRichText(createSelectableRichTextManager());
  });
});

describe('createSelectableRichTextManager', () => {
  it('creates a manager with no focused target', () => {
    expect(createSelectableRichTextManager()!.focused === undefined).toBe(true);
  });
});

describe('dispatchSelectableRichTextKeyDown', () => {
  it('does not invoke on copy when selection is empty', () => {
    const manager = createSelectableRichTextManager();
    focusSelectableRichText(manager, richText('hello'));
    const copied = { value: [] as never[] };
    const callbackValues = copied;
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'c';
    data.keyCode = KEY_CODE_C;
    dispatchSelectableRichTextKeyDown(manager, data, (text) => {
      callbackValues.value.push(String(text));
    });
    expect(copied.value.length === 0).toBe(true);
  });
  it('invokes on copy callback for copy command', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello world');
    focusSelectableRichText(manager, text);
    const richTextRuntime = runtime(text);
    richTextRuntime!.selectionBeginIndex = 6;
    richTextRuntime!.selectionEndIndex = 11;
    const copied = { value: [] as never[] };
    const callbackValues = copied;
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'c';
    data.keyCode = KEY_CODE_C;
    expect(
      dispatchSelectableRichTextKeyDown(manager, data, (value) => {
        callbackValues.value.push(String(value));
      }),
    ).toBe(true);
    expect(copied.value).toEqual(['world']);
  });
  it('returns false for unhandled keys', () => {
    const manager = createSelectableRichTextManager();
    focusSelectableRichText(manager, richText(''));
    let data = keyboardData();
    data.key = 'ArrowLeft';
    expect(!dispatchSelectableRichTextKeyDown(manager, data, undefined)).toBe(true);
  });
  it('returns false when nothing is focused', () => {
    expect(!dispatchSelectableRichTextKeyDown(createSelectableRichTextManager(), keyboardData(), undefined)).toBe(true);
  });
  it('selects all on ctrl a', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello');
    focusSelectableRichText(manager, text);
    let data = keyboardData();
    data.ctrlKey = true;
    data.key = 'a';
    data.keyCode = KEY_CODE_A;
    expect(dispatchSelectableRichTextKeyDown(manager, data, undefined)).toBe(true);
    const richTextRuntime = runtime(text);
    expect(richTextRuntime!.selectionBeginIndex).toEqual(0);
    expect(richTextRuntime!.selectionEndIndex).toEqual(5);
  });
});

describe('dispatchSelectableRichTextPointerDown', () => {
  it('extends the selection end when extend is true', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello');
    const richTextRuntime = runtime(text);
    richTextRuntime!.selectionBeginIndex = 1;
    dispatchSelectableRichTextPointerDown(manager, text, 0.0, 0.0, true);
    expect(richTextRuntime!.selectionBeginIndex).toEqual(1);
  });
  it('sets focus and collapses selection when layout is none', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello');
    const richTextRuntime = runtime(text);
    richTextRuntime!.selectionBeginIndex = 2;
    richTextRuntime!.selectionEndIndex = 2;
    dispatchSelectableRichTextPointerDown(manager, text, 0.0, 0.0, false);
    expect(manager!.focused! === text).toBe(true);
    expect(richTextRuntime!.selectionBeginIndex).toEqual(0);
    expect(richTextRuntime!.selectionEndIndex).toEqual(0);
  });
});

describe('dispatchSelectableRichTextPointerMove', () => {
  it('does nothing when focused target has no layout', () => {
    const manager = createSelectableRichTextManager();
    focusSelectableRichText(manager, richText('hello'));
    dispatchSelectableRichTextPointerMove(manager, 10.0, 5.0);
  });
  it('does not panic when nothing is focused', () => {
    dispatchSelectableRichTextPointerMove(createSelectableRichTextManager(), 0.0, 0.0);
  });
});

describe('dispatchSelectableRichTextWheel', () => {
  it('advances scroll v by the given delta', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello');
    focusSelectableRichText(manager, text);
    expect(text!.data.scrollV).toEqual(1.0);
    dispatchSelectableRichTextWheel(manager, 2.0);
    expect(text!.data.scrollV).toEqual(3.0);
  });
  it('does not panic when nothing is focused', () => {
    dispatchSelectableRichTextWheel(createSelectableRichTextManager(), 2.0);
  });
});

describe('focusSelectableRichText', () => {
  it('sets the focused target', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello');
    focusSelectableRichText(manager, text);
    expect(manager!.focused! === text).toBe(true);
  });
});

describe('getSelectableRichTextSelectionText', () => {
  it('returns empty string when nothing is focused', () => {
    expect(getSelectableRichTextSelectionText(createSelectableRichTextManager())).toEqual('');
  });
  it('returns the selected slice of text', () => {
    const manager = createSelectableRichTextManager();
    const text = richText('hello world');
    focusSelectableRichText(manager, text);
    const richTextRuntime = runtime(text);
    richTextRuntime!.selectionBeginIndex = 6;
    richTextRuntime!.selectionEndIndex = 11;
    expect(getSelectableRichTextSelectionText(manager)).toEqual('world');
  });
});

describe('initializeSelectableRichTextManager', () => {
  it('is the construction initializer of create selectable rich text manager', () => {
    let manager: SelectableRichTextManagerRaw = Object.assign(allocateEntity<SelectableRichTextManagerRaw>(), {
      focused: undefined,
    });
    initializeSelectableRichTextManager(manager);
    expect(manager.focused === undefined).toBe(true);
  });
});
