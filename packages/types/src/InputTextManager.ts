import type { InputSignals } from './InputSignals';
import type { InputText } from './InputText';

export interface InputTextInputSource extends Pick<InputSignals, 'onKeyDown' | 'onTextInput'> {}

export interface InputTextManager {
  enabled: boolean;
  focused: InputText | null;
}
