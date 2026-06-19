// The opt-in editable-field state for RichText. Editing is a mode of a rich field, not a separate entity
// (OpenFL TextField type=INPUT), so this consolidates the password/restrict/selection-style fields and
// the caret/focus/selection runtime state into a single runtime slot attached by enableTextInput
// (@flighthq/text-input). A static RichText that never calls enableTextInput carries none of this — and
// never pulls @flighthq/text-input into its bundle.
export interface TextInputState {
  alwaysShowSelection: boolean;
  caretIndex: number;
  displayAsPassword: boolean;
  focused: boolean;
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
  displayAsPassword?: boolean;
  passwordCharacter?: string;
  restrict?: string;
  selectionAlpha?: number;
  selectionColor?: number;
}
