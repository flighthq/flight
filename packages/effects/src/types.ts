import type { EntityRaw, EntityRuntime, EntityRuntimeKey, Kind } from '@flighthq/entity/contract';
import type { RenderTargetDepth, RenderTargetFormat } from '@flighthq/render/contract';

// Advanced blend modes are the destination-reading / non-separable set that the fixed-function
// `BlendMode` enum deliberately excludes: they cannot be expressed as GL fixed-function blend state, so
// they are NOT a cheap per-node property. They are realized as an explicit composite-recipe effect
// (`BlendEffect`) that bounces through an offscreen and samples both the layer and its backdrop —
// keeping the enum a footgun-free fixed-function set (assigning `node.blendMode = Overlay` and getting a
// silent Normal fallback is the bug this split avoids). The value is simultaneously the registry key and
// the serialized form. Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo').
//
// The separable members (Overlay..ColorBurn, Darken, Lighten) each compute an output channel from only
// the matching backdrop/source channel. The four HSL modes (Hue..Luminosity) are non-separable: each
// blends a whole RGB triple by transplanting one HSL attribute, so they cannot be computed per channel.
//
// MEMBERSHIP OVERLAPS the fixed-function `BlendMode` enum for exactly Darken and Lighten, and the
// overlap is deliberate rather than an oversight — a test pins the intersection so a future one has to be
// chosen too. The two tiers answer different questions for those modes:
//
//   BlendMode.Darken     — MIN blend state. Cheap, no offscreen, EXACT for an opaque backdrop, and what
//                          Canvas 2D realizes correctly and cheaply via globalCompositeOperation.
//                          Approximate under partial coverage; at zero alpha it wipes to black.
//   AdvancedBlendMode.Darken — the faithful realization, through a BlendEffect bounce, carrying the
//                          `(1-a)*dst + a*B(src,dst)` coverage term that MIN/MAX provably cannot express.
//
// So a caller picks by content, not by capability: opaque or edge-free content takes the enum member and
// pays nothing; content with transparent edges takes the effect and pays a pass. The original rule this
// relaxes was guarding a different footgun — a mode in the enum with NO fixed-function realization,
// silently falling back to Normal. Darken/Lighten do have one; it is merely approximate, and now named.
export const AdvancedBlendMode = {
  Color: 'Color',
  ColorBurn: 'ColorBurn',
  ColorDodge: 'ColorDodge',
  Darken: 'Darken',
  Difference: 'Difference',
  Exclusion: 'Exclusion',
  HardLight: 'HardLight',
  Hue: 'Hue',
  Lighten: 'Lighten',
  Luminosity: 'Luminosity',
  Overlay: 'Overlay',
  Saturation: 'Saturation',
  SoftLight: 'SoftLight',
} as const;

export type AdvancedBlendMode = string;

// Open substrate-agnostic base contract for render-effect intents. The kind is both the serialized
// discriminant and the per-backend registry key; concrete effect records remain open to third parties.
export interface Effect extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: Kind;
}

// Shared offscreen target axes for Canvas, GL and WGPU effect pipelines.
export interface EffectStateOptions {
  // Depth attachment for depth-dependent effects (SSAO, DoF, fog). Default 'none'.
  depth?: RenderTargetDepth;
  // 'rgba16f' gives bloom/tone-mapping HDR headroom. Default 'rgba8'.
  format?: RenderTargetFormat;
  // MSAA on the scene target so going offscreen for effects keeps edge AA. Default 1.
  sampleCount?: number;
}
