import type { InputSignals } from './InputSignals';
import type { RichText } from './RichText';

export interface TextInputSource extends Pick<InputSignals, 'onKeyDown' | 'onTextInput'> {}

// `focused` is the RichText currently receiving text input — the field enableTextInput was called on.
// There is no distinct TextInput entity; editing is an opt-in capability of RichText.
export interface TextInputManager {
  enabled: boolean;
  focused: RichText | null;
}
