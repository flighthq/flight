// Generated from crates/flight-textinput/src/text_input_manager.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { InputKeyboardData } from '@flighthq/input/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type { SignalSlot } from '@flighthq/signals/contract';
import { getTextLayout, setRichTextScrollV } from '@flighthq/text/contract';
import type { RichText } from '@flighthq/text/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';

import { getTextInputState } from './textInput.ts';
import {
  getTextInputCharacterIndexAtPoint,
  handleTextInputKeyboard,
  insertTextInput,
  moveTextInputCaret,
  selectLineAtTextInputIndex,
  selectWordAtTextInputIndex,
} from './textInputEditing.ts';
import { jsRound } from './textUnits.ts';
import type {
  HandleTextInputKeyboardOptions,
  TextInputCopyCallback,
  TextInputDisposer,
  TextInputManagerRaw,
  TextInputSource,
} from './types.ts';

export function blurTextInput(manager: TextInputManagerRaw): void {
  const target = manager!.focused ?? undefined;
  if (target !== undefined) {
    setTextInputFocused(target, false);
  }
  manager!.focused = null;
}

export function connectInputToTextInput(
  input: Readonly<TextInputSource>,
  manager: TextInputManagerRaw,
): TextInputDisposer {
  const keyManager = manager;
  const onKeyDown: SignalSlot<InputKeyboardData> = (data) => {
    dispatchTextInputKeyDown(keyManager, data, undefined, undefined);
  };
  const textManager = manager;
  const onTextInput = (data: Readonly<flightInput.InputTextData>) => {
    dispatchTextInput(textManager, data.text);
  };
  const keyId = connectSignal(input.onKeyDown, onKeyDown, undefined);
  const textId = connectSignal(input.onTextInput, onTextInput, undefined);
  const keySignal = input.onKeyDown;
  const textSignal = input.onTextInput;
  return () => {
    disconnectSignal(keySignal, keyId);
    disconnectSignal(textSignal, textId);
  };
}

export function createTextInputManager(): TextInputManagerRaw {
  let out: TextInputManagerRaw = Object.assign(allocateEntity<TextInputManagerRaw>(), {
    enabled: false,
    focused: null,
  });
  initializeTextInputManager(out);
  return out;
}

export function dispatchTextInput(manager: TextInputManagerRaw, text: string): boolean {
  const target = getTextInputFocusTarget(manager);
  if (target === undefined) {
    return false;
  }
  if (text.length === 0) {
    return false;
  }
  insertTextInput(target, text);
  return true;
}

export function dispatchTextInputKeyDown(
  manager: TextInputManagerRaw,
  data: Readonly<InputKeyboardData>,
  clipboardText?: string,
  onCopy?: TextInputCopyCallback,
): boolean {
  const target = getTextInputFocusTarget(manager);
  if (target === undefined) {
    return false;
  }
  const options: HandleTextInputKeyboardOptions = {
    clipboardText: ((value) => (value === undefined ? undefined : String(value)))(clipboardText),
    layout: getTargetLayout(target),
    onCopy: onCopy,
  };
  return handleTextInputKeyboard(target, data, options);
}

export function dispatchTextInputPointerDown(
  manager: TextInputManagerRaw,
  target: RichText,
  x: number,
  y: number,
  extend: boolean,
  clickCount: number,
): void {
  focusTextInput(manager, target);
  const layout = getTargetLayout(target);
  if (layout === undefined) {
    return;
  }
  const index = getTextInputCharacterIndexAtPoint(target, layout!, x, y);
  if (clickCount >= 3) {
    selectLineAtTextInputIndex(target, index | 0);
  } else {
    if (clickCount === 2) {
      selectWordAtTextInputIndex(target, index | 0);
    } else {
      moveTextInputCaret(target, index | 0, extend);
    }
  }
}

export function dispatchTextInputPointerMove(manager: TextInputManagerRaw, x: number, y: number): void {
  let target = manager!.focused ?? undefined;
  if (target === undefined) {
    return;
  }
  if (!target!.enabled) {
    return;
  }
  const layout = getTargetLayout(target);
  if (layout === undefined) {
    return;
  }
  const index = getTextInputCharacterIndexAtPoint(target, layout!, x, y);
  moveTextInputCaret(target, index | 0, true);
}

export function dispatchTextInputWheel(manager: TextInputManagerRaw, deltaLines: number): void {
  let target = manager!.focused ?? undefined;
  if (target === undefined) {
    return;
  }
  const targetGuard = target!;
  if (!targetGuard.enabled) {
    return;
  }
  const scrollV = targetGuard.data.scrollV;
  void targetGuard;
  setRichTextScrollV(target, scrollV + jsRound(deltaLines), undefined);
}

export function focusTextInput(manager: TextInputManagerRaw, target: RichText): void {
  const previous = manager!.focused ?? undefined;
  if (previous !== undefined) {
    if (!(previous === target)) {
      setTextInputFocused(previous, false);
    }
  }
  manager!.focused = target;
  setTextInputFocused(target, true);
}

export function initializeTextInputManager(out: TextInputManagerRaw): void {
  out.enabled = true;
  out.focused = null;
}

function getTargetLayout(target: RichText): TextLayoutResult | undefined {
  const node: NodeRef = target;
  return getTextLayout(node) ?? undefined;
}

function getTextInputFocusTarget(manager: TextInputManagerRaw): RichText | undefined {
  manager = manager!;
  if (!manager.enabled) {
    return undefined;
  }
  const target = manager.focused ?? undefined;
  if (target === undefined) {
    return undefined;
  }
  if (!target!.enabled) {
    return undefined;
  }
  return target;
}

function setTextInputFocused(target: RichText, focused: boolean): void {
  {
    const $state = getTextInputState(target) ?? undefined;
    if ($state !== undefined) {
      const state = $state;
      state!.focused = focused;
    }
  }
}
