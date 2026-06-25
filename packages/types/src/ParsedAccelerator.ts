import type { ShortcutModifier } from './ShortcutModifier';

// The decomposed form of an accelerator: its canonical key token plus its modifiers in canonical
// order. Written into by parseAccelerator as an `out` argument (allocate with createParsedAccelerator).
export interface ParsedAccelerator {
  key: string;
  modifiers: ShortcutModifier[];
}
