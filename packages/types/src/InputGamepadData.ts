export interface InputGamepadAxisData {
  axis: number;
  gamepad: number;
  value: number;
}

export interface InputGamepadButtonData {
  button: number;
  gamepad: number;
  value: number;
}

export interface InputGamepadConnectData {
  gamepad: number;
  id: string;
}
