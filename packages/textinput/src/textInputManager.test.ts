import { createSignal, emitSignal } from '@flighthq/signals';
import { createRichText, getRichTextRuntime } from '@flighthq/text';
import type { RichText, RichTextData, RichTextRuntime, TextLayoutResult } from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

import { enableTextInput, getTextInputState } from './textInput';
import {
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  setTextInputSelection,
} from './textInputEditing';
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
} from './textInputManager';

function createInput(data: Partial<RichTextData> = {}): RichText {
  const text = createRichText({ data });
  enableTextInput(text);
  return text;
}

// Creates a mock layout for "hello world" (11 chars) as a single line. Each character is 10px wide,
// starting at offsetX=2. This makes getTextInputCharacterIndexAtPoint predictable: x=7 lands on
// index 0, x=17 on index 1, etc. (midpoint rounding: x < offsetX + advance/2 → that index).
function createSingleLineLayout(): TextLayoutResult {
  return {
    groups: [
      {
        ascent: 10,
        descent: 2,
        endIndex: 11,
        format: {},
        height: 12,
        leading: 0,
        lineIndex: 0,
        offsetX: 2,
        offsetY: 2,
        positions: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
        startIndex: 0,
        width: 110,
      },
    ],
    lineAscents: [10],
    lineDescents: [2],
    lineHeights: [12],
    lineLeadings: [0],
    lineWidths: [110],
    numLines: 1,
    textHeight: 12,
    textWidth: 110,
  };
}

function setLayout(target: RichText, layout: TextLayoutResult): void {
  (getRichTextRuntime(target) as RichTextRuntime).textLayout = layout;
}

function isFocused(node: RichText): boolean {
  return getTextInputState(node)?.focused === true;
}

const keyData = {
  altKey: false,
  capsLock: false,
  code: '',
  ctrlKey: false,
  key: 'Backspace',
  keyCode: KeyCode.BACKSPACE,
  location: 0,
  metaKey: false,
  modifier: 0,
  numLock: false,
  repeat: false,
  shiftKey: false,
  timeStamp: 0,
};

describe('blurTextInput', () => {
  it('clears the focused target', () => {
    const manager = createTextInputManager();
    const input = createInput();
    focusTextInput(manager, input);
    expect(isFocused(input)).toBe(true);
    blurTextInput(manager);
    expect(manager.focused).toBeNull();
    expect(isFocused(input)).toBe(false);
  });
});

describe('connectInputToTextInput', () => {
  it('routes normalized text input into the focused target', () => {
    const input = { onKeyDown: createSignal(), onTextInput: createSignal() };
    const manager = createTextInputManager();
    const target = createInput();
    focusTextInput(manager, target);
    const disconnect = connectInputToTextInput(input, manager);

    emitSignal(input.onTextInput, { length: 1, start: 0, text: 'A' });

    expect(target.data.text).toBe('A');
    disconnect();
    emitSignal(input.onTextInput, { length: 1, start: 0, text: 'B' });
    expect(target.data.text).toBe('A');
  });
});

describe('createTextInputManager', () => {
  it('creates an enabled manager without focus', () => {
    const manager = createTextInputManager();
    expect(manager.enabled).toBe(true);
    expect(manager.focused).toBeNull();
  });
});

describe('dispatchTextInput', () => {
  it('inserts text into the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput();
    focusTextInput(manager, target);
    expect(dispatchTextInput(manager, 'x')).toBe(true);
    expect(target.data.text).toBe('x');
  });

  it('returns false without focus', () => {
    expect(dispatchTextInput(createTextInputManager(), 'x')).toBe(false);
  });
});

describe('dispatchTextInputKeyDown', () => {
  it('routes keyboard commands into the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'abc' });
    setTextInputSelection(target, 2, 2);
    focusTextInput(manager, target);
    expect(dispatchTextInputKeyDown(manager, keyData)).toBe(true);
    expect(target.data.text).toBe('ac');
  });

  it('invokes onCopy callback for copy command', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello' });
    setTextInputSelection(target, 0, 5);
    focusTextInput(manager, target);
    const copied: string[] = [];
    dispatchTextInputKeyDown(manager, { ...keyData, ctrlKey: true, key: 'c', keyCode: KeyCode.C }, undefined, (text) =>
      copied.push(text),
    );
    expect(copied).toEqual(['hello']);
  });
});

describe('dispatchTextInputPointerDown', () => {
  it('focuses the target', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello' });
    dispatchTextInputPointerDown(manager, target, 0, 0);
    expect(manager.focused).toBe(target);
    expect(isFocused(target)).toBe(true);
  });

  it('selects a word on double-click (clickCount=2)', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello world' });
    setLayout(target, createSingleLineLayout());
    // x=7 lands on index 0 (inside "hello"); clickCount=2 selects the word.
    dispatchTextInputPointerDown(manager, target, 7, 5, false, 2);
    expect(getTextInputSelectionBeginIndex(target)).toBe(0);
    expect(getTextInputSelectionEndIndex(target)).toBe(5);
  });

  it('selects a line on triple-click (clickCount=3)', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello world' });
    setLayout(target, createSingleLineLayout());
    // Any x on the single line; clickCount=3 selects the entire line.
    dispatchTextInputPointerDown(manager, target, 7, 5, false, 3);
    expect(getTextInputSelectionBeginIndex(target)).toBe(0);
    expect(getTextInputSelectionEndIndex(target)).toBe(11);
  });
});

describe('dispatchTextInputPointerMove', () => {
  it('does not throw when nothing is focused', () => {
    expect(() => dispatchTextInputPointerMove(createTextInputManager(), 0, 0)).not.toThrow();
  });

  it('extends selection when dragging after pointer-down', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello world' });
    const layout = createSingleLineLayout();
    setLayout(target, layout);
    // Pointer-down at index 2 (x=2+2*10=22, midpoint at 27; use 23 to land on index 2).
    dispatchTextInputPointerDown(manager, target, 23, 5);
    expect(getTextInputSelectionBeginIndex(target)).toBe(2);
    expect(getTextInputSelectionEndIndex(target)).toBe(2);
    // Pointer-move to index 7 (x=2+7*10=72, midpoint at 77; use 73 to land on index 7).
    dispatchTextInputPointerMove(manager, 73, 5);
    expect(getTextInputSelectionBeginIndex(target)).toBe(2);
    expect(getTextInputSelectionEndIndex(target)).toBe(7);
  });

  it('extends selection backward when pointer moves left', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello world' });
    const layout = createSingleLineLayout();
    setLayout(target, layout);
    // Pointer-down at index 7 (x=73).
    dispatchTextInputPointerDown(manager, target, 73, 5);
    // Pointer-move to index 2 (x=23).
    dispatchTextInputPointerMove(manager, 23, 5);
    expect(getTextInputSelectionBeginIndex(target)).toBe(2);
    expect(getTextInputSelectionEndIndex(target)).toBe(7);
  });

  it('clamps selection at text boundaries', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello world' });
    const layout = createSingleLineLayout();
    setLayout(target, layout);
    // Pointer-down at index 5.
    dispatchTextInputPointerDown(manager, target, 53, 5);
    // Pointer-move far past the end of text.
    dispatchTextInputPointerMove(manager, 999, 5);
    expect(getTextInputSelectionEndIndex(target)).toBe(11);
    // Pointer-move far before the start of text.
    dispatchTextInputPointerMove(manager, -100, 5);
    expect(getTextInputSelectionBeginIndex(target)).toBe(0);
  });
});

describe('dispatchTextInputWheel', () => {
  it('advances scrollV by the given delta', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'hello' });
    focusTextInput(manager, target);
    expect(target.data.scrollV).toBe(1);
    dispatchTextInputWheel(manager, 2);
    expect(target.data.scrollV).toBe(3);
  });

  it('does not throw when nothing is focused', () => {
    expect(() => dispatchTextInputWheel(createTextInputManager(), 1)).not.toThrow();
  });
});

describe('focusTextInput', () => {
  it('sets the focused target', () => {
    const manager = createTextInputManager();
    const target = createInput({ text: 'abc' });
    focusTextInput(manager, target);
    expect(manager.focused).toBe(target);
    expect(isFocused(target)).toBe(true);
    expect(getTextInputSelectionBeginIndex(target)).toBe(0);
    expect(getTextInputSelectionEndIndex(target)).toBe(0);
  });

  it('clears focus from the previous target', () => {
    const manager = createTextInputManager();
    const first = createInput();
    const second = createInput();
    focusTextInput(manager, first);
    focusTextInput(manager, second);
    expect(isFocused(first)).toBe(false);
    expect(isFocused(second)).toBe(true);
  });
});
