// The opt-in editable-field state for RichText. Editing is a mode of a rich field, not a separate entity
// (OpenFL TextField type=INPUT), so this consolidates the password/restrict/selection-style fields and
// the caret/focus/selection runtime state into a single runtime slot attached by enableTextInput
// (@flighthq/textinput). A static RichText that never calls enableTextInput carries none of this — and
// never pulls @flighthq/textinput into its bundle.
// One recorded edit in a field's undo/redo history. Holds the text and caret/selection on both sides
// of the edit so undo restores the *before* side and redo the *after* side. `mergeKind` is a non-null
// tag shared by a run of same-kind keystrokes (e.g. 'type') that coalesce into a single undo step; a
// null kind never merges.
export interface TextInputHistoryEntry {
  caretIndexAfter: number;
  caretIndexBefore: number;
  mergeKind: string | null;
  selectionIndexAfter: number;
  selectionIndexBefore: number;
  textAfter: string;
  textBefore: string;
}

export interface TextInputState {
  alwaysShowSelection: boolean;
  caretColor: number;
  caretIndex: number;
  caretWidth: number;
  // The remembered x column for continuous vertical navigation; -1 when unset (anchors to the caret
  // on the next up/down keystroke). Horizontal motion and edits reset it.
  desiredCaretX: number;
  displayAsPassword: boolean;
  focused: boolean;
  history: TextInputHistoryEntry[];
  // Cursor into `history`: the index of the record an undo would restore; -1 when nothing is undoable.
  historyIndex: number;
  // Maximum number of retained undo records; 0 disables history entirely.
  historyLimit: number;
  passwordCharacter: string;
  restrict: string;
  selectionAlpha: number;
  selectionColor: number;
  selectionIndex: number;
}

// Authoring options for enableTextInput — the configurable subset of TextInputState. The caret/focus/
// selection-index fields are runtime state, not authoring inputs, so they are not configurable here.
export interface TextInputOptions {
  alwaysShowSelection?: boolean;
  caretColor?: number;
  caretWidth?: number;
  displayAsPassword?: boolean;
  historyLimit?: number;
  passwordCharacter?: string;
  restrict?: string;
  selectionAlpha?: number;
  selectionColor?: number;
}
