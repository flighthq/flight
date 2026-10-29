// Generated from crates/flight-textinput/src/text_input.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { getRichTextRuntime } from '@flighthq/text/contract';
import type { RichText, TextInputOptions, TextInputState } from '@flighthq/text/contract';

function createTextInputState(options?: Readonly<TextInputOptions>): TextInputState {
  let state = {
    alwaysShowSelection: false,
    caretColor: 0x0000_00ff,
    caretIndex: 0,
    caretWidth: 1.0,
    desiredCaretX: -1.0,
    displayAsPassword: false,
    focused: false,
    history: [],
    historyIndex: -1,
    historyLimit: 100,
    passwordCharacter: '•',
    restrict: '',
    selectionAlpha: 0.35,
    selectionColor: 0x0078_d7ff,
    selectionIndex: 0,
  };
  if (options !== undefined) {
    applyTextInputOptions(state, options);
  }
  return state;
}

function applyTextInputOptions(state: TextInputState, options: Readonly<TextInputOptions>): void {
  if (options.alwaysShowSelection !== undefined) {
    const value = options.alwaysShowSelection;
    state.alwaysShowSelection = value;
  }
  if (options.caretColor !== undefined) {
    const value = options.caretColor;
    state.caretColor = value;
  }
  if (options.caretWidth !== undefined) {
    const value = options.caretWidth;
    state.caretWidth = value;
  }
  if (options.displayAsPassword !== undefined) {
    const value = options.displayAsPassword;
    state.displayAsPassword = value;
  }
  if (options.historyLimit !== undefined) {
    const value = options.historyLimit;
    state.historyLimit = value;
  }
  if (options.passwordCharacter !== undefined) {
    const value = options.passwordCharacter;
    state.passwordCharacter = value;
  }
  if (options.restrict !== undefined) {
    const value = options.restrict;
    state.restrict = value;
  }
  if (options.selectionAlpha !== undefined) {
    const value = options.selectionAlpha;
    state.selectionAlpha = value;
  }
  if (options.selectionColor !== undefined) {
    const value = options.selectionColor;
    state.selectionColor = value;
  }
}

export function disableTextInput(node: RichText): void {
  const runtime = (() => {
    node = node!;
    return getRichTextRuntime(node);
  })();
  runtime!.input = undefined;
}

export function enableTextInput(node: RichText, options?: Readonly<TextInputOptions>): TextInputState {
  const runtime = (() => {
    node = node!;
    return getRichTextRuntime(node);
  })();
  const existing = runtime!.input;
  if (existing !== undefined) {
    const state = existing;
    if (options !== undefined) {
      applyTextInputOptions(state!, options);
    }
    return state;
  }
  const state = createTextInputState(options);
  runtime!.input = state;
  return state;
}

export function getTextInputState(node: RichText): TextInputState | undefined {
  const runtime = (() => {
    node = node!;
    return getRichTextRuntime(node);
  })();
  const input = runtime!.input;
  return input;
}

export function hasTextInput(node: RichText): boolean {
  return getTextInputState(node) !== undefined;
}
