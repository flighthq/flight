// Blend modes are an open family: the built-in vocabulary below is canonical PascalCase, and each
// backend interprets a mode into its own fixed-function realization. The value is simultaneously the
// registry key and the serialized form, so a scene round-trips with no string<->identifier seam.
// Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo').
//
// This enum is deliberately the CHEAP FIXED-FUNCTION SET only: every mode maps to a premultiplied
// fixed-function blend state, so `node.blend` is a per-node property that never needs an offscreen pass.
// Everything that needs an isolated layer lives elsewhere, by cost, not by W3C taxonomy:
//   - destination-reading / non-separable blends (Overlay, HardLight, …, the HSL modes) → `AdvancedBlendMode`
//     applied as a `BlendEffect`;
//   - Porter-Duff coverage operators (Erase = DestinationOut, Alpha = DestinationIn, None = Copy, and the
//     rest) → `CompositeOperator` applied as a `CompositeEffect`.
// Non-members with no cheap home: `Invert` is a backdrop-reading effect; `Subtract` is a rare GL blend
// equation wired on demand via `registerGlBlendMode` (unnamed, vendor-prefixed) — "Subtract" is too
// overloaded to bless. See agents/blend-composite-architecture.md.
export const BlendMode = {
  Add: 'Add',
  Darken: 'Darken',
  Lighten: 'Lighten',
  Multiply: 'Multiply',
  Normal: 'Normal',
  Screen: 'Screen',
} as const;

export type BlendMode = string;
