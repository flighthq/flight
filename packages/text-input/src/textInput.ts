import { getRichTextRuntime } from '@flighthq/text';
import type { RichText, RichTextRuntime, TextInputOptions, TextInputState } from '@flighthq/types';

// The opt-in seam that turns a static RichText into an editable field. Importing it is what pulls
// @flighthq/text-input into an app's bundle; a RichText that never calls enableTextInput stays free of
// selection/caret/input code. The editing/manager functions in textInputEditing.ts and
// textInputManager.ts read the input state through getTextInputState.

// Detaches the editable-field slot, returning the node to a static RichText. The field's text and rich
// content remain on the RichText itself; only the input mode (caret/focus/selection style) is released.
export function disableTextInput(node: RichText): void {
  (getRichTextRuntime(node) as RichTextRuntime).input = null;
}

// Allocates (or returns) the editable-field slot on a RichText, mirroring the enable* opt-in pattern.
// Idempotent: a second call returns the existing state, applying any options passed.
export function enableTextInput(node: RichText, options?: Readonly<TextInputOptions>): TextInputState {
  const runtime = getRichTextRuntime(node) as RichTextRuntime;
  let state = runtime.input;
  if (state === null) {
    state = createTextInputState(options);
    runtime.input = state;
  } else if (options !== undefined) {
    applyTextInputOptions(state, options);
  }
  return state;
}

export function getTextInputState(node: Readonly<RichText>): TextInputState | null {
  return getRichTextRuntime(node).input;
}

export function hasTextInput(node: Readonly<RichText>): boolean {
  return getRichTextRuntime(node).input !== null;
}

function applyTextInputOptions(state: TextInputState, options: Readonly<TextInputOptions>): void {
  if (options.alwaysShowSelection !== undefined) state.alwaysShowSelection = options.alwaysShowSelection;
  if (options.displayAsPassword !== undefined) state.displayAsPassword = options.displayAsPassword;
  if (options.passwordCharacter !== undefined) state.passwordCharacter = options.passwordCharacter;
  if (options.restrict !== undefined) state.restrict = options.restrict;
  if (options.selectionAlpha !== undefined) state.selectionAlpha = options.selectionAlpha;
  if (options.selectionColor !== undefined) state.selectionColor = options.selectionColor;
}

// Defaults match OpenFL's TextField input conventions (bullet password char, light selection tint).
function createTextInputState(options?: Readonly<TextInputOptions>): TextInputState {
  return {
    alwaysShowSelection: options?.alwaysShowSelection ?? false,
    caretIndex: 0,
    displayAsPassword: options?.displayAsPassword ?? false,
    focused: false,
    passwordCharacter: options?.passwordCharacter ?? '•',
    restrict: options?.restrict ?? '',
    selectionAlpha: options?.selectionAlpha ?? 0.35,
    selectionColor: options?.selectionColor ?? 0x0078d7,
    selectionIndex: 0,
  };
}
