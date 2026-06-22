import { connectSignal, disconnectSignal } from '@flighthq/signals';
import { getRichTextRuntime, setRichTextScrollV } from '@flighthq/text';
import type {
  InputKeyboardData,
  RichText,
  TextInputManager,
  TextInputSource,
  TextSelectionRange,
} from '@flighthq/types';

import { getTextInputState } from './textInput';
import {
  getTextInputCharacterIndexAtPoint,
  handleTextInputKeyboard,
  insertTextInput,
  moveTextInputCaret,
  selectLineAtTextInputIndex,
  selectWordAtTextInputIndex,
} from './textInputEditing';

export function blurTextInput(manager: TextInputManager): void {
  const target = manager.focused;
  if (target !== null) setTextInputFocused(target, false);
  manager.focused = null;
}

export function connectInputToTextInput(input: TextInputSource, manager: TextInputManager): () => void {
  const onKeyDown = (data: Readonly<InputKeyboardData>) => dispatchTextInputKeyDown(manager, data);
  const onTextInput = (data: Readonly<TextSelectionRange>) => dispatchTextInput(manager, data.text);

  connectSignal(input.onKeyDown, onKeyDown);
  connectSignal(input.onTextInput, onTextInput);

  return () => {
    disconnectSignal(input.onKeyDown, onKeyDown);
    disconnectSignal(input.onTextInput, onTextInput);
  };
}

export function createTextInputManager(): TextInputManager {
  return {
    enabled: true,
    focused: null,
  };
}

export function dispatchTextInput(manager: TextInputManager, text: string): boolean {
  const target = getTextInputFocusTarget(manager);
  if (target === null || text.length === 0) return false;
  insertTextInput(target, text);
  return true;
}

export function dispatchTextInputKeyDown(
  manager: TextInputManager,
  data: Readonly<InputKeyboardData>,
  clipboardText?: string,
): boolean {
  const target = getTextInputFocusTarget(manager);
  if (target === null) return false;
  return handleTextInputKeyboard(target, data, {
    clipboardText,
    onCopy: (text: string) => {
      navigator.clipboard?.writeText(text);
    },
  });
}

export function dispatchTextInputPointerDown(
  manager: TextInputManager,
  target: RichText,
  x: number,
  y: number,
  extend = false,
  clickCount = 1,
): void {
  focusTextInput(manager, target);
  const layout = getRichTextRuntime(target).textLayout;
  if (layout === null) return;
  const index = getTextInputCharacterIndexAtPoint(target, layout, x, y);
  if (clickCount >= 3) {
    selectLineAtTextInputIndex(target, index);
  } else if (clickCount === 2) {
    selectWordAtTextInputIndex(target, index);
  } else {
    moveTextInputCaret(target, index, extend);
  }
}

export function dispatchTextInputPointerMove(manager: TextInputManager, x: number, y: number): void {
  const target = manager.focused;
  if (target === null || !target.enabled) return;
  const layout = getRichTextRuntime(target).textLayout;
  if (layout === null) return;
  const index = getTextInputCharacterIndexAtPoint(target, layout, x, y);
  moveTextInputCaret(target, index, true);
}

export function dispatchTextInputWheel(manager: TextInputManager, deltaLines: number): void {
  const target = manager.focused;
  if (target === null || !target.enabled) return;
  setRichTextScrollV(target, target.data.scrollV + Math.round(deltaLines));
}

export function focusTextInput(manager: TextInputManager, target: RichText): void {
  if (manager.focused !== target) {
    const previous = manager.focused;
    if (previous !== null) setTextInputFocused(previous, false);
  }
  manager.focused = target;
  setTextInputFocused(target, true);
}

function getTextInputFocusTarget(manager: TextInputManager): RichText | null {
  if (!manager.enabled) return null;
  const target = manager.focused;
  if (target === null || !target.enabled) return null;
  return target;
}

// Writes the focused flag on the editable-input slot. A null slot means input was disabled on the node
// since it was focused, so there is nothing to flag — silently skip.
function setTextInputFocused(target: RichText, focused: boolean): void {
  const state = getTextInputState(target);
  if (state !== null) state.focused = focused;
}
