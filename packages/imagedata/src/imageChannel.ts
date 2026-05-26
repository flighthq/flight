export const ImageChannel = {
  Red: 0,
  Green: 1,
  Blue: 2,
  Alpha: 3,
} as const;

export type ImageChannel = (typeof ImageChannel)[keyof typeof ImageChannel];
