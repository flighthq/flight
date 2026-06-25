export interface InputGamepadAxisData {
  axis: number;
  gamepad: number;
  timeStamp: number;
  value: number;
}

export interface InputGamepadButtonData {
  button: number;
  gamepad: number;
  timeStamp: number;
  value: number;
}

export interface InputGamepadConnectData {
  gamepad: number;
  id: string;
  mapping: GamepadMapping;
}

export type GamepadMapping = 'standard' | 'raw' | '';
