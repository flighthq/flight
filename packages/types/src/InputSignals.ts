import type { InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData } from './InputGamepadData';
import type { InputKeyboardData } from './InputKeyboardData';
import type { InputPointerData } from './InputPointerData';
import type { InputTextData } from './InputTextData';
import type { Signal } from './Signal';

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
  onTextEdit: Signal<(data: Readonly<InputTextData>) => void>;
  onTextInput: Signal<(data: Readonly<InputTextData>) => void>;
  onWheel: Signal<(data: Readonly<InputPointerData>) => void>;
}
