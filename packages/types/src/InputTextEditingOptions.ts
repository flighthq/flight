export interface HandleInputTextKeyboardOptions {
  clipboardText?: string;
  onCopy?: (text: string) => void;
}

export interface ReplaceInputTextOptions {
  applyInputRules?: boolean;
}
