import { createSignal, emitSignal } from '@flighthq/signals/contract';
import { enableTextFieldSignals, getRichTextRuntime } from '@flighthq/text/contract';
import {
  blurTextInput,
  createTextInputManager,
  disableTextInput,
  dispatchTextInput,
  dispatchTextInputKeyDown,
  dispatchTextInputPointerDown,
  dispatchTextInputPointerMove,
  dispatchTextInputWheel,
  enableTextInput,
  focusTextInput,
  getTextInputCaretRectangle,
  hasTextInput,
} from '@flighthq/textinput/contract';
import type {
  InputKeyboardData,
  KeyboardEventData,
  Node2D,
  PointerEventData,
  RichText,
  TextInputManager,
  TextInputController,
  TextInputControllerOptions,
  TextInputControllerSignals,
} from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
  setGuiVisualProperty,
} from './guiController';

interface TextInputControllerFields {
  background: Node2D | null;
  caret: Node2D | null;
  manager: TextInputManager;
  ownsInput: boolean;
  signals: TextInputControllerSignals;
  textField: RichText | null;
}

export function blurTextInputController(controller: TextInputController): void {
  const runtime = getGuiControllerRuntime<TextInputControllerFields>(controller);
  if (runtime.textField === null) return;
  blurTextInput(runtime.manager);
  setGuiVisible(runtime, runtime.caret, false);
}

export function createTextInputController(options: Readonly<TextInputControllerOptions>): TextInputController {
  const ownsInput = !hasTextInput(options.textField);
  enableTextInput(options.textField);
  const runtime = createGuiControllerRuntime<TextInputControllerFields>(
    {
      background: options.background ?? null,
      caret: options.caret ?? null,
      manager: options.manager ?? createTextInputManager(),
      ownsInput,
      signals: { onChange: createSignal(), onSubmit: createSignal() },
      textField: options.textField,
    },
    options.transition,
  );
  const controller = createGuiController<TextInputController, typeof runtime>(runtime);
  connectGuiSignal(runtime, enableTextFieldSignals(options.textField).onTextFieldChange, (event) => {
    updateTextInputControllerCaret(runtime);
    emitSignal(runtime.signals.onChange, event.text);
  });
  connectGuiInteraction(runtime, options.textField, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    dispatchTextInputPointerDown(runtime.manager, options.textField, data.localX, data.localY, data.shiftKey);
    updateTextInputControllerCaret(runtime);
  });
  connectGuiInteraction(runtime, options.textField, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    if (data.buttons !== 0) {
      dispatchTextInputPointerMove(runtime.manager, data.localX, data.localY);
      updateTextInputControllerCaret(runtime);
    }
  });
  connectGuiInteraction(runtime, options.textField, 'onWheel', (data: Readonly<PointerEventData>) => {
    dispatchTextInputWheel(runtime.manager, data.deltaY);
  });
  connectGuiInteraction(runtime, options.textField, 'onFocusIn', () => focusTextInputController(controller));
  connectGuiInteraction(runtime, options.textField, 'onFocusOut', () => blurTextInputController(controller));
  connectGuiInteraction(runtime, options.textField, 'onKeyDown', (data: Readonly<KeyboardEventData>) => {
    dispatchTextInputControllerKeyDown(controller, keyboardEventToInput(data));
  });
  if (options.input !== undefined) {
    connectGuiSignal(runtime, options.input.onKeyDown, (data) => {
      dispatchTextInputControllerKeyDown(controller, data);
    });
    connectGuiSignal(runtime, options.input.onTextInput, (data) =>
      dispatchTextInputControllerText(controller, data.text),
    );
  }
  setGuiVisible(runtime, runtime.caret, false);
  return controller;
}

export function dispatchTextInputControllerKeyDown(
  controller: TextInputController,
  data: Readonly<InputKeyboardData>,
): boolean {
  const runtime = getGuiControllerRuntime<TextInputControllerFields>(controller);
  if (runtime.textField === null) return false;
  if (data.key === 'Enter') emitSignal(runtime.signals.onSubmit, runtime.textField.data.text);
  const previousText = runtime.textField.data.text;
  const handled = dispatchTextInputKeyDown(runtime.manager, data);
  if (runtime.textField.data.text !== previousText) emitSignal(runtime.signals.onChange, runtime.textField.data.text);
  updateTextInputControllerCaret(runtime);
  return handled;
}

export function dispatchTextInputControllerText(controller: TextInputController, text: string): boolean {
  const runtime = getGuiControllerRuntime<TextInputControllerFields>(controller);
  if (runtime.textField === null) return false;
  const previousText = runtime.textField.data.text;
  const handled = dispatchTextInput(runtime.manager, text);
  if (runtime.textField.data.text !== previousText) emitSignal(runtime.signals.onChange, runtime.textField.data.text);
  updateTextInputControllerCaret(runtime);
  return handled;
}

export function disposeTextInputController(controller: TextInputController): void {
  const runtime = getGuiControllerRuntime<TextInputControllerFields>(controller);
  disposeGuiController(controller, () => {
    if (runtime.textField !== null) {
      if (runtime.manager.focused === runtime.textField) blurTextInput(runtime.manager);
      if (runtime.ownsInput) disableTextInput(runtime.textField);
    }
    runtime.background = null;
    runtime.caret = null;
    runtime.textField = null;
  });
}

export function focusTextInputController(controller: TextInputController): void {
  const runtime = getGuiControllerRuntime<TextInputControllerFields>(controller);
  if (runtime.textField === null) return;
  focusTextInput(runtime.manager, runtime.textField);
  setGuiVisible(runtime, runtime.caret, true);
  updateTextInputControllerCaret(runtime);
}

export function getTextInputControllerSignals(controller: TextInputController): Readonly<TextInputControllerSignals> {
  return getGuiControllerRuntime<TextInputControllerFields>(controller).signals;
}

function keyboardEventToInput(data: Readonly<KeyboardEventData>): InputKeyboardData {
  return {
    altKey: data.altKey,
    capsLock: false,
    code: data.key,
    ctrlKey: data.ctrlKey,
    key: data.key,
    keyCode: data.keyCode,
    location: 0,
    metaKey: data.metaKey,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: data.shiftKey,
    timeStamp: 0,
  };
}

function updateTextInputControllerCaret(
  runtime: ReturnType<typeof getGuiControllerRuntime<TextInputControllerFields>>,
): void {
  if (runtime.textField === null || runtime.caret === null || runtime.manager.focused !== runtime.textField) return;
  const layout = getRichTextRuntime(runtime.textField).textLayout;
  if (layout === null) return;
  const rectangle = { height: 0, lineIndex: 0, width: 0, x: 0, y: 0 };
  getTextInputCaretRectangle(rectangle, runtime.textField, layout);
  setGuiVisualProperty(runtime, runtime.caret, 'x', rectangle.x);
  setGuiVisualProperty(runtime, runtime.caret, 'y', rectangle.y);
}
