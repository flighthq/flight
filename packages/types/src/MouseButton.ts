export const MouseButton = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
} as const;

export type MouseButton = (typeof MouseButton)[keyof typeof MouseButton];
