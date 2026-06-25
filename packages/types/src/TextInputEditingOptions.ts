import type { TextLayoutResult } from './TextLayout';

export interface HandleTextInputKeyboardOptions {
  clipboardText?: string;
  // The current layout, required to resolve up/down navigation to a character index. Absent layout
  // degenerates vertical motion to text start/end.
  layout?: Readonly<TextLayoutResult>;
  onCopy?: (text: string) => void;
}

export interface ReplaceTextInputOptions {
  applyInputRules?: boolean;
  // A non-null tag that coalesces a run of same-kind edits into one undo step; null never merges.
  mergeKind?: string | null;
  // When true, the edit is applied without recording an undo entry.
  skipHistory?: boolean;
}
