// The complete vocabulary of ways surface combines a source pixel with its backdrop — a single umbrella
// over both the color-blend functions (Multiply, Overlay, …) and the Porter-Duff coverage operators
// (DestinationOut = erase, DestinationIn = alpha mask, …). surface has no fixed-function-vs-effect cost
// split — it composites in software, pixel by pixel — so unlike the GPU vocabularies it carries both axes
// under one name and one parameter. This mirrors the Canvas globalCompositeOperation model, which likewise
// unifies blend and composite in a single value.
//
// It is independent of BlendMode / CompositeOperator / AdvancedBlendMode: surface owns its domain
// vocabulary (WASM-bound, self-contained), so reshaping the GPU-facing enums never touches it. It shares
// their canonical PascalCase string values, so any GPU mode string is already a valid SurfaceCompositeMode.
// Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo'); unknown modes composite source-over.
export const SurfaceCompositeMode = {
  Add: 'Add',
  Clear: 'Clear',
  ColorBurn: 'ColorBurn',
  ColorDodge: 'ColorDodge',
  Copy: 'Copy',
  Darken: 'Darken',
  DestinationAtop: 'DestinationAtop',
  DestinationIn: 'DestinationIn',
  DestinationOut: 'DestinationOut',
  DestinationOver: 'DestinationOver',
  Difference: 'Difference',
  Exclusion: 'Exclusion',
  HardLight: 'HardLight',
  Invert: 'Invert',
  Lighten: 'Lighten',
  Multiply: 'Multiply',
  Normal: 'Normal',
  Overlay: 'Overlay',
  Screen: 'Screen',
  SoftLight: 'SoftLight',
  SourceAtop: 'SourceAtop',
  SourceIn: 'SourceIn',
  SourceOut: 'SourceOut',
  SourceOver: 'SourceOver',
  Subtract: 'Subtract',
  Xor: 'Xor',
} as const;

export type SurfaceCompositeMode = string;
