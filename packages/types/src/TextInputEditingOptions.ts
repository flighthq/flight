export interface HandleTextInputKeyboardOptions {
  clipboardText?: string;
  onCopy?: (text: string) => void;
}

export interface ReplaceTextInputOptions {
  applyInputRules?: boolean;
}
