export const GamepadAxisKind = {
  STICK_LEFT_X: 'StickLeftX',
  STICK_LEFT_Y: 'StickLeftY',
  STICK_RIGHT_X: 'StickRightX',
  STICK_RIGHT_Y: 'StickRightY',
} as const;

export type GamepadAxisKind = (typeof GamepadAxisKind)[keyof typeof GamepadAxisKind];
