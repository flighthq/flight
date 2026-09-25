import type { Entity } from './Entity.ts';
import type { InputGamepadAxisData, InputGamepadButtonData, InputGamepadConnectData } from './InputGamepadData.ts';
import type { InputKeyboardData } from './InputKeyboardData.ts';
import type { InputPointerData } from './InputPointerData.ts';
import type { InputTextData } from './InputTextData.ts';
import type { Signal } from './Signal.ts';

export interface InputSignals extends Entity {
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
