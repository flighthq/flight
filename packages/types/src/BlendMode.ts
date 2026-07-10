// Blend modes are an open family: the built-in vocabulary below is canonical
// PascalCase, and each backend interprets a mode into its own fixed-function or
// shader realization. The value is simultaneously the registry key and the
// serialized form, so a scene round-trips with no string<->identifier seam.
// Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo').
export const BlendMode = {
  Add: 'Add',
  Alpha: 'Alpha',
  Darken: 'Darken',
  Difference: 'Difference',
  Erase: 'Erase',
  HardLight: 'HardLight',
  Invert: 'Invert',
  Layer: 'Layer',
  Lighten: 'Lighten',
  Multiply: 'Multiply',
  Normal: 'Normal',
  Overlay: 'Overlay',
  Screen: 'Screen',
  Shader: 'Shader',
  Subtract: 'Subtract',
} as const;

export type BlendMode = string;
