// Owned by `@flighthq/bitmap` (its contract lane declares the same names). This deprecated structural
// copy stays because a core package may cross into an owner only with type-only edges.
export const ImageChannel = {
  Red: 0,
  Green: 1,
  Blue: 2,
  Alpha: 3,
};

export type ImageChannel = (typeof ImageChannel)[keyof typeof ImageChannel];
