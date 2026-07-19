// Blend modes are an open family: the built-in vocabulary below is canonical PascalCase, and each
// backend interprets a mode into its own fixed-function realization. The value is simultaneously the
// registry key and the serialized form, so a scene round-trips with no string<->identifier seam.
// Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo').
//
// This enum is deliberately FIXED-FUNCTION ONLY: every mode here maps to a GL fixed-function blend
// state (or a trivial unary op), so it is a cheap per-node property (`node.blendMode`) that never needs
// a pass. The destination-reading / non-separable advanced modes (Overlay, HardLight, SoftLight,
// Difference, Exclusion, ColorDodge, ColorBurn, and the HSL modes Hue/Saturation/Color/Luminosity) are
// NOT here on purpose — assigning one as a node property would silently fall back to Normal on gl/wgpu,
// which is the footgun this split avoids. They live in `AdvancedBlendMode` and are applied explicitly as
// a `BlendEffect` composite recipe that bounces through an offscreen and samples layer + backdrop.
export const BlendMode = {
  Add: 'Add',
  Alpha: 'Alpha',
  Darken: 'Darken',
  Erase: 'Erase',
  Invert: 'Invert',
  Layer: 'Layer',
  Lighten: 'Lighten',
  Multiply: 'Multiply',
  // No blending: the source overwrites the destination (no alpha compositing). The GPU-oriented
  // no-blend mode (Pixi/Starling `NONE`), absent from OpenFL. Faithful only on gl/wgpu; canvas/dom
  // have no per-node equivalent and degrade to Normal.
  None: 'None',
  Normal: 'Normal',
  Screen: 'Screen',
  Shader: 'Shader',
  Subtract: 'Subtract',
} as const;

export type BlendMode = string;
