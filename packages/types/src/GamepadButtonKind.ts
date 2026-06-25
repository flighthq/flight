export const GamepadButtonKind = {
  BUTTON_EAST: 'ButtonEast',
  BUTTON_NORTH: 'ButtonNorth',
  BUTTON_SOUTH: 'ButtonSouth',
  BUTTON_WEST: 'ButtonWest',
  DPAD_DOWN: 'DpadDown',
  DPAD_LEFT: 'DpadLeft',
  DPAD_RIGHT: 'DpadRight',
  DPAD_UP: 'DpadUp',
  HOME: 'Home',
  SELECT: 'Select',
  SHOULDER_LEFT: 'ShoulderLeft',
  SHOULDER_RIGHT: 'ShoulderRight',
  START: 'Start',
  STICK_LEFT: 'StickLeft',
  STICK_RIGHT: 'StickRight',
  TOUCHPAD: 'Touchpad',
  TRIGGER_LEFT: 'TriggerLeft',
  TRIGGER_RIGHT: 'TriggerRight',
} as const;

export type GamepadButtonKind = (typeof GamepadButtonKind)[keyof typeof GamepadButtonKind];
