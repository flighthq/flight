import { createSignal, emitSignal } from '@flighthq/signals';
import { createRichText } from '@flighthq/text';
import type { RichText, RichTextData } from '@flighthq/types';
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
});

describe('dispatchTextInputPointerMove', () => {
  it('does not throw when nothing is focused', () => {
    expect(() => dispatchTextInputPointerMove(createTextInputManager(), 0, 0)).not.toThrow();
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
