export interface InputState {
  axisValues: Map<number, number>;
  gamepadButtonsDown: Set<number>;
  justPressedGamepadButtons: Set<number>;
  justPressedKeys: Set<number>;
  justReleasedGamepadButtons: Set<number>;
  justReleasedKeys: Set<number>;
  keysDown: Set<number>;
  pointerButtonsDown: Map<number, number>;
}
