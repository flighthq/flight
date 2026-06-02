import { createInputText, getInputTextRuntime } from '@flighthq/scene-display';
import { createSignal, emitSignal } from '@flighthq/signals';
import { KeyCode } from '@flighthq/types';

import {
  getInputTextSelectionBeginIndex,
  getInputTextSelectionEndIndex,
  setInputTextSelection,
} from './inputTextEditing';
import {
  blurInputText,
  connectInputToInputText,
  createInputTextManager,
  dispatchInputTextInput,
  dispatchInputTextKeyDown,
  dispatchInputTextPointerDown,
  dispatchInputTextPointerMove,
  dispatchInputTextWheel,
  focusInputText,
} from './inputTextManager';

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
};

describe('blurInputText', () => {
  it('clears the focused target', () => {
    const manager = createInputTextManager();
    const input = createInputText();
    focusInputText(manager, input);
    expect(getInputTextRuntime(input).focused).toBe(true);
    blurInputText(manager);
    expect(manager.focused).toBeNull();
    expect(getInputTextRuntime(input).focused).toBe(false);
  });
});

describe('connectInputToInputText', () => {
  it('routes normalized text input into the focused target', () => {
    const input = { onKeyDown: createSignal(), onTextInput: createSignal() };
    const manager = createInputTextManager();
    const target = createInputText();
    focusInputText(manager, target);
    const disconnect = connectInputToInputText(input, manager);

    emitSignal(input.onTextInput, { length: 1, start: 0, text: 'A' });

    expect(target.data.text).toBe('A');
    disconnect();
    emitSignal(input.onTextInput, { length: 1, start: 0, text: 'B' });
    expect(target.data.text).toBe('A');
  });
});

describe('createInputTextManager', () => {
  it('creates an enabled manager without focus', () => {
    const manager = createInputTextManager();
    expect(manager.enabled).toBe(true);
    expect(manager.focused).toBeNull();
  });
});

describe('dispatchInputTextInput', () => {
  it('inserts text into the focused target', () => {
    const manager = createInputTextManager();
    const target = createInputText();
    focusInputText(manager, target);
    expect(dispatchInputTextInput(manager, 'x')).toBe(true);
    expect(target.data.text).toBe('x');
  });

  it('returns false without focus', () => {
    expect(dispatchInputTextInput(createInputTextManager(), 'x')).toBe(false);
  });
});

describe('dispatchInputTextKeyDown', () => {
  it('routes keyboard commands into the focused target', () => {
    const manager = createInputTextManager();
    const target = createInputText({ data: { text: 'abc' } });
    setInputTextSelection(target, 2, 2);
    focusInputText(manager, target);
    expect(dispatchInputTextKeyDown(manager, keyData)).toBe(true);
    expect(target.data.text).toBe('ac');
  });
});

describe('dispatchInputTextPointerDown', () => {
  it('focuses the target', () => {
    const manager = createInputTextManager();
    const target = createInputText({ data: { text: 'hello' } });
    dispatchInputTextPointerDown(manager, target, 0, 0);
    expect(manager.focused).toBe(target);
    expect(getInputTextRuntime(target).focused).toBe(true);
  });
});

describe('dispatchInputTextPointerMove', () => {
  it('does not throw when nothing is focused', () => {
    expect(() => dispatchInputTextPointerMove(createInputTextManager(), 0, 0)).not.toThrow();
  });
});

describe('dispatchInputTextWheel', () => {
  it('advances scrollV by the given delta', () => {
    const manager = createInputTextManager();
    const target = createInputText({ data: { text: 'hello' } });
    focusInputText(manager, target);
    expect(target.data.scrollV).toBe(1);
    dispatchInputTextWheel(manager, 2);
    expect(target.data.scrollV).toBe(3);
  });

  it('does not throw when nothing is focused', () => {
    expect(() => dispatchInputTextWheel(createInputTextManager(), 1)).not.toThrow();
  });
});

describe('focusInputText', () => {
  it('sets the focused target', () => {
    const manager = createInputTextManager();
    const target = createInputText({ data: { text: 'abc' } });
    focusInputText(manager, target);
    expect(manager.focused).toBe(target);
    expect(getInputTextRuntime(target).focused).toBe(true);
    expect(getInputTextSelectionBeginIndex(target)).toBe(0);
    expect(getInputTextSelectionEndIndex(target)).toBe(0);
  });

  it('clears focus from the previous target', () => {
    const manager = createInputTextManager();
    const first = createInputText();
    const second = createInputText();
    focusInputText(manager, first);
    focusInputText(manager, second);
    expect(getInputTextRuntime(first).focused).toBe(false);
    expect(getInputTextRuntime(second).focused).toBe(true);
  });
});
