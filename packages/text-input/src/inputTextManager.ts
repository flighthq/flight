import { getInputTextRuntime, setRichTextScrollV } from '@flighthq/displayobject';
import { connectSignal, disconnectSignal } from '@flighthq/signals';
import type {
  InputKeyboardData,
  InputText,
  InputTextInputSource,
  InputTextManager,
  InputTextRuntime,
  TextSelectionRange,
} from '@flighthq/types';

import {
  getInputTextCharacterIndexAtPoint,
  handleInputTextKeyboard,
  insertInputText,
  moveInputTextCaret,
  selectLineAtInputTextIndex,
  selectWordAtInputTextIndex,
} from './inputTextEditing';

export function blurInputText(manager: InputTextManager): void {
  const target = manager.focused;
  if (target !== null) setInputTextFocused(target, false);
  manager.focused = null;
}

export function connectInputToInputText(input: InputTextInputSource, manager: InputTextManager): () => void {
  const onKeyDown = (data: Readonly<InputKeyboardData>) => dispatchInputTextKeyDown(manager, data);
  const onTextInput = (data: Readonly<TextSelectionRange>) => dispatchInputTextInput(manager, data.text);

  connectSignal(input.onKeyDown, onKeyDown);
  connectSignal(input.onTextInput, onTextInput);

  return () => {
    disconnectSignal(input.onKeyDown, onKeyDown);
    disconnectSignal(input.onTextInput, onTextInput);
  };
}

export function createInputTextManager(): InputTextManager {
  return {
    enabled: true,
    focused: null,
  };
}

export function dispatchInputTextInput(manager: InputTextManager, text: string): boolean {
  const target = getInputTextFocusTarget(manager);
  if (target === null || text.length === 0) return false;
  insertInputText(target, text);
  return true;
}

export function dispatchInputTextKeyDown(
  manager: InputTextManager,
  data: Readonly<InputKeyboardData>,
  clipboardText?: string,
): boolean {
  const target = getInputTextFocusTarget(manager);
  if (target === null) return false;
  return handleInputTextKeyboard(target, data, {
    clipboardText,
    onCopy: (text: string) => {
      navigator.clipboard?.writeText(text);
    },
  });
}

export function dispatchInputTextPointerDown(
  manager: InputTextManager,
  target: InputText,
  x: number,
  y: number,
  extend = false,
  clickCount = 1,
): void {
  focusInputText(manager, target);
  const runtime = getInputTextRuntime(target) as InputTextRuntime;
  if (runtime.textLayout === null) return;
  const index = getInputTextCharacterIndexAtPoint(target, runtime.textLayout, x, y);
  if (clickCount >= 3) {
    selectLineAtInputTextIndex(target, index);
  } else if (clickCount === 2) {
    selectWordAtInputTextIndex(target, index);
  } else {
    moveInputTextCaret(target, index, extend);
  }
}

export function dispatchInputTextPointerMove(manager: InputTextManager, x: number, y: number): void {
  const target = manager.focused;
  if (target === null || !target.enabled) return;
  const runtime = getInputTextRuntime(target) as InputTextRuntime;
  if (runtime.textLayout === null) return;
  const index = getInputTextCharacterIndexAtPoint(target, runtime.textLayout, x, y);
  moveInputTextCaret(target, index, true);
}

export function dispatchInputTextWheel(manager: InputTextManager, deltaLines: number): void {
  const target = manager.focused;
  if (target === null || !target.enabled) return;
  setRichTextScrollV(target, target.data.scrollV + Math.round(deltaLines));
}

export function focusInputText(manager: InputTextManager, target: InputText): void {
  if (manager.focused !== target) {
    const previous = manager.focused;
    if (previous !== null) setInputTextFocused(previous, false);
  }
  manager.focused = target;
  setInputTextFocused(target, true);
}

function getInputTextFocusTarget(manager: InputTextManager): InputText | null {
  if (!manager.enabled) return null;
  const target = manager.focused;
  if (target === null || !target.enabled) return null;
  return target;
}

function setInputTextFocused(target: InputText, focused: boolean): void {
  (getInputTextRuntime(target) as InputTextRuntime).focused = focused;
}
