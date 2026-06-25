export const SoftKeyboardEasingDefaultKind = 'ease';
export type SoftKeyboardEasingDefaultKind = typeof SoftKeyboardEasingDefaultKind;
export const SoftKeyboardEasingEaseInKind = 'easeIn';
export type SoftKeyboardEasingEaseInKind = typeof SoftKeyboardEasingEaseInKind;
export const SoftKeyboardEasingEaseOutKind = 'easeOut';
export type SoftKeyboardEasingEaseOutKind = typeof SoftKeyboardEasingEaseOutKind;
export const SoftKeyboardEasingLinearKind = 'linear';
export type SoftKeyboardEasingLinearKind = typeof SoftKeyboardEasingLinearKind;
export const SoftKeyboardEasingKeyboardDefaultKind = 'keyboardDefault';
export type SoftKeyboardEasingKeyboardDefaultKind = typeof SoftKeyboardEasingKeyboardDefaultKind;
export type SoftKeyboardEasingKind =
  | SoftKeyboardEasingDefaultKind
  | SoftKeyboardEasingEaseInKind
  | SoftKeyboardEasingEaseOutKind
  | SoftKeyboardEasingLinearKind
  | SoftKeyboardEasingKeyboardDefaultKind;
