// Acyclic build entry selected by contract-only projects through the `.textinput-types` module suffix.
// The published @flighthq/textinput/contract entry remains contract.ts, which adds the runtime barrel.
export type {
  HandleTextInputKeyboardOptions,
  ReplaceTextInputOptions,
  SelectableRichTextManager,
  SelectableRichTextManagerRaw,
  TextInputCopyCallback,
  TextInputDisposer,
  TextInputEditRecord,
  TextInputManager,
  TextInputManagerRaw,
  TextInputSource,
} from './types.ts';
