// Generated from crates/flight-textinput/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { InputKeyboardData, InputTextData } from '@flighthq/input/contract';
import type { SignalRaw } from '@flighthq/signals/contract';
import type { RichText } from '@flighthq/text/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';

export type TextInputCopyCallback = (arg0: string) => void;

export type TextInputDisposer = () => void;

export interface HandleTextInputKeyboardOptions {
  clipboardText?: string;
  layout?: Readonly<TextLayoutResult>;
  onCopy?: TextInputCopyCallback;
}

export interface ReplaceTextInputOptions {
  applyInputRules?: boolean;
  mergeKind?: string | null;
  skipHistory?: boolean;
}

export interface SelectableRichTextManager extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  focused: RichText | null;
}

export interface SelectableRichTextManagerRaw extends EntityRaw {
  focused: RichText | null;
}

export interface TextInputEditRecord {
  caretIndexAfter: number;
  caretIndexBefore: number;
  mergeKind: string | null;
  selectionIndexAfter: number;
  selectionIndexBefore: number;
  textAfter: string;
  textBefore: string;
}

export interface TextInputManagerRaw extends EntityRaw {
  enabled: boolean;
  focused: RichText | null;
}

export interface TextInputManager extends TextInputManagerRaw {}

export interface TextInputSource {
  onKeyDown: SignalRaw<InputKeyboardData>;
  onTextInput: SignalRaw<InputTextData>;
}
