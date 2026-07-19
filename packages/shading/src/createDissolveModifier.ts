import type { DissolveModifier, Texture } from '@flighthq/types';
import { DissolveModifierKind, ModifierSlot } from '@flighthq/types';

// The options for `createDissolveModifier`. Only `threshold` is required; the rest carry documented
// defaults. `map` presence is compile-time structural (sampled mask vs procedural noise, driving the
// define-key signature); `threshold`/`edgeWidth`/`scale` are uniform-fed and `edgeColor` is packed.
export interface DissolveModifierOptions {
  threshold: number;
  edgeColor?: number;
  edgeWidth?: number;
  map?: Texture;
  scale?: number;
}

// Builds a DissolveModifier (slot: Effect) — a clip/burn dissolve of the shaded output. A per-fragment
// noise value (procedural over the UV, or sampled from `map`'s red channel) is compared against
// `threshold`; fragments below it are discarded and a band of width `edgeWidth` above it glows
// `edgeColor`. Animate `threshold` from 0 to 1 to disintegrate the surface. `edgeColor` is packed sRgb
// RGBA (default 0xff6600ff); `edgeWidth` defaults to 0.05 (0 = hard clip); `scale` (procedural-noise
// frequency, ignored with `map`) defaults to 8. `map` is copied by reference only when provided.
export function createDissolveModifier(options: Readonly<DissolveModifierOptions>): DissolveModifier {
  const modifier: DissolveModifier = {
    kind: DissolveModifierKind,
    slot: ModifierSlot.Effect,
    threshold: options.threshold,
    edgeColor: options.edgeColor ?? 0xff6600ff,
    edgeWidth: options.edgeWidth ?? 0.05,
    scale: options.scale ?? 8,
  };
  if (options.map !== undefined) modifier.map = options.map;
  return modifier;
}
