// Advanced blend modes are the destination-reading / non-separable set that the fixed-function
// `BlendMode` enum deliberately excludes: they cannot be expressed as GL fixed-function blend state, so
// they are NOT a cheap per-node property. They are realized as an explicit composite-recipe effect
// (`BlendEffect`) that bounces through an offscreen and samples both the layer and its backdrop —
// keeping the enum a footgun-free fixed-function set (assigning `node.blendMode = Overlay` and getting a
// silent Normal fallback is the bug this split avoids). The value is simultaneously the registry key and
// the serialized form. Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo').
//
// The first seven (Overlay..ColorBurn) are separable — each output channel depends only on the matching
// backdrop/source channel. The last four (Hue..Luminosity) are non-separable HSL modes: each blends a
// whole RGB triple by transplanting one HSL attribute, so they cannot be computed per channel.
export const AdvancedBlendMode = {
  Color: 'Color',
  ColorBurn: 'ColorBurn',
  ColorDodge: 'ColorDodge',
  Difference: 'Difference',
  Exclusion: 'Exclusion',
  HardLight: 'HardLight',
  Hue: 'Hue',
  Luminosity: 'Luminosity',
  Overlay: 'Overlay',
  Saturation: 'Saturation',
  SoftLight: 'SoftLight',
} as const;

export type AdvancedBlendMode = string;
