import type { Entity } from './Entity.ts';
import type { InputSignals } from './InputSignals.ts';
import type { RichText } from './RichText.ts';

export interface TextInputSource extends Pick<InputSignals, 'onKeyDown' | 'onTextInput'> {}

// `focused` is the RichText currently receiving text input — the field enableTextInput was called on.
// There is no distinct TextInput entity; editing is an opt-in capability of RichText.
export interface TextInputManager extends Entity {
  enabled: boolean;
  focused: RichText | null;
}
