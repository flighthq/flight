import type { ShortcutKeyName } from './ShortcutKeyName';
import type { ShortcutModifier } from './ShortcutModifier';

// The decomposed form of an accelerator: its canonical key token plus its modifiers in canonical
// order. Written into by parseAccelerator as an `out` argument (allocate with makeParsedAccelerator).
//
// `key` is '' only in the zero value a fresh makeParsedAccelerator() returns — a successful parse
// always writes a real ShortcutKeyName, and a failed parse leaves `out` untouched, so '' means
// "never parsed into" rather than "parsed to nothing".
//
// `modifiers` is filled in place: parseAccelerator clears and refills the array the caller allocated
// rather than replacing it, so a reference held to `parsed.modifiers` stays live across parses.
export interface ParsedAccelerator {
  key: ShortcutKeyName | '';
  modifiers: ShortcutModifier[];
}
