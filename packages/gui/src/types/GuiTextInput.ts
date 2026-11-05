import type { EntityRaw } from '@flighthq/entity/contract';
import type { InputKeyboardData, InputTextData } from '@flighthq/input/contract';
import type { SignalRaw } from '@flighthq/signals/contract';
import type { RichText } from '@flighthq/text/contract';

export interface GuiTextInputManager extends EntityRaw {
  enabled: boolean;
  focused: RichText | null;
}

export interface GuiTextInputSource {
  onKeyDown: SignalRaw<InputKeyboardData>;
  onTextInput: SignalRaw<InputTextData>;
}
