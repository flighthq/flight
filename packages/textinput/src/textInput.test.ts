// Generated from crates/flight-textinput/tests/text_input_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

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

import { disableTextInput, getTextInputState, hasTextInput } from './contract.ts';

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

describe('disableTextInput', () => {
  it('detaches the input slot', () => {
    const text = createRichText(undefined);
    enableTextInput(text, undefined);
    disableTextInput(text);
    expect(!hasTextInput(text)).toBe(true);
    expect(text!.data.text).toEqual('');
  });
});

describe('enableTextInput', () => {
  it('allocates the input slot with default state', () => {
    const text = createRichText(undefined);
    let state = enableTextInput(text, undefined);
    state = state!;
    expect(state.caretIndex).toEqual(0);
    expect(state.selectionIndex).toEqual(0);
    expect(state.passwordCharacter).toEqual('•');
    expect(state.historyLimit).toEqual(100);
  });
  it('applies authoring options', () => {
    const text = createRichText(undefined);
    let state = enableTextInput(text, {
      ...inputOptions(),
      caretColor: 0xff00_00ff,
      displayAsPassword: true,
      restrict: '0-9',
    });
    state = state!;
    expect(state.caretColor).toEqual(0xff00_00ff);
    expect(state.displayAsPassword).toBe(true);
    expect(state.restrict).toEqual('0-9');
  });
  it('is idempotent and returns the existing state applying new options', () => {
    const text = createTestRichText({ data: undefined, layoutContext: undefined });
    const first = enableTextInput(text, undefined);
    const second = enableTextInput(text, { ...inputOptions(), caretWidth: 3.0 });
    expect(first === second).toBe(true);
    expect(first!.caretWidth).toEqual(3.0);
  });
});

describe('getTextInputState', () => {
  it('returns none on a static rich text', () => {
    expect(getTextInputState(createRichText(undefined)) === undefined).toBe(true);
  });
  it('returns the slot once enabled', () => {
    const text = createRichText(undefined);
    const enabled = enableTextInput(text, undefined);
    expect(enabled === getTextInputState(text)!).toBe(true);
  });
});

describe('hasTextInput', () => {
  it('is false until enabled and true after', () => {
    const text = createRichText(undefined);
    expect(!hasTextInput(text)).toBe(true);
    enableTextInput(text, undefined);
    expect(hasTextInput(text)).toBe(true);
  });
});
