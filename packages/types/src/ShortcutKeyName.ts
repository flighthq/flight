// The canonical key token of an accelerator chord — the non-modifier half of 'Control+Shift+K'.
// These are the names normalizeAccelerator emits; the many accepted input spellings (case variants,
// 'esc', 'pgdn', 'num0', a bare '/') all resolve to one of these. Names follow the physical-key
// vocabulary (BracketLeft, Backquote, Minus) rather than the shifted glyph a layout produces, so a
// chord means the same key on every keyboard layout.
//
// The set is bounded by what a native global-hotkey host can actually register — it tracks Electron's
// documented accelerator key codes. A key outside this union is not a Flight limitation to lift
// locally: it is a key no backend would accept.
export type ShortcutKeyName =
  | ShortcutDigitKeyName
  | ShortcutEditingKeyName
  | ShortcutFunctionKeyName
  | ShortcutLetterKeyName
  | ShortcutLockKeyName
  | ShortcutMediaKeyName
  | ShortcutNavigationKeyName
  | ShortcutNumpadKeyName
  | ShortcutPunctuationKeyName;

export type ShortcutDigitKeyName = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type ShortcutEditingKeyName = 'Backspace' | 'Delete' | 'Escape' | 'Insert' | 'Return' | 'Space' | 'Tab';

export type ShortcutFunctionKeyName =
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'F13'
  | 'F14'
  | 'F15'
  | 'F16'
  | 'F17'
  | 'F18'
  | 'F19'
  | 'F20'
  | 'F21'
  | 'F22'
  | 'F23'
  | 'F24';

export type ShortcutLetterKeyName =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z';

export type ShortcutLockKeyName = 'CapsLock' | 'NumLock' | 'PrintScreen' | 'ScrollLock';

export type ShortcutMediaKeyName =
  | 'MediaNextTrack'
  | 'MediaPlayPause'
  | 'MediaPreviousTrack'
  | 'MediaStop'
  | 'VolumeDown'
  | 'VolumeMute'
  | 'VolumeUp';

export type ShortcutNavigationKeyName =
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'End'
  | 'Home'
  | 'PageDown'
  | 'PageUp';

export type ShortcutNumpadKeyName =
  | 'Numpad0'
  | 'Numpad1'
  | 'Numpad2'
  | 'Numpad3'
  | 'Numpad4'
  | 'Numpad5'
  | 'Numpad6'
  | 'Numpad7'
  | 'Numpad8'
  | 'Numpad9'
  | 'NumpadAdd'
  | 'NumpadDecimal'
  | 'NumpadDivide'
  | 'NumpadEnter'
  | 'NumpadMultiply'
  | 'NumpadSubtract';

export type ShortcutPunctuationKeyName =
  | 'Backquote'
  | 'Backslash'
  | 'BracketLeft'
  | 'BracketRight'
  | 'Comma'
  | 'Equal'
  | 'Minus'
  | 'Period'
  | 'Plus'
  | 'Quote'
  | 'Semicolon'
  | 'Slash';
