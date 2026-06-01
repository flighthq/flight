import type { InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData } from './InputGamepadData';
import type { InputKeyboardData } from './InputKeyboardData';
import type { InputPointerData } from './InputPointerData';
import type { Signal } from './Signal';
import type { TextInputData } from './TextInputData';

export interface InputSignals {
  onGamepadAxisMove: Signal<(data: Readonly<InputGamepadAxisData>) => void>;
  onGamepadButtonDown: Signal<(data: Readonly<InputGamepadButtonData>) => void>;
  onGamepadButtonUp: Signal<(data: Readonly<InputGamepadButtonData>) => void>;
  onGamepadConnect: Signal<(data: Readonly<InputGamepadConnectData>) => void>;
  onGamepadDisconnect: Signal<(data: Readonly<InputGamepadConnectData>) => void>;
  onKeyDown: Signal<(data: Readonly<InputKeyboardData>) => void>;
  onKeyUp: Signal<(data: Readonly<InputKeyboardData>) => void>;
  onPointerCancel: Signal<(data: Readonly<InputPointerData>) => void>;
  onPointerDown: Signal<(data: Readonly<InputPointerData>) => void>;
  onPointerMove: Signal<(data: Readonly<InputPointerData>) => void>;
  onPointerMoveRelative: Signal<(data: Readonly<InputPointerData>) => void>;
  onPointerUp: Signal<(data: Readonly<InputPointerData>) => void>;
  onTextEdit: Signal<(data: Readonly<TextInputData>) => void>;
  onTextInput: Signal<(data: Readonly<TextInputData>) => void>;
  onWheel: Signal<(data: Readonly<InputPointerData>) => void>;
}
