import type { Modifier } from './Modifier';
import type { Texture } from './Texture';

// A clip/burn dissolve of the shaded output (slot: Effect): a per-fragment noise value (procedural
// value noise over the UV, or a sampled `map`) is compared against `threshold`; fragments below it are
// discarded, and a band of width `edgeWidth` just above the threshold is tinted `edgeColor` (the
// glowing burn edge). Animating `threshold` from 0 to 1 dissolves the surface away — the teleport /
// disintegrate / burn-away effect. `edgeColor` is packed sRgb RGBA; set `edgeWidth` to 0 for a hard
// clip with no edge. Runs in the Effect slot after lighting so it burns the final radiance and can
// discard the fragment entirely.
export interface DissolveModifier extends Modifier {
  kind: 'DissolveModifier';
  slot: 'Effect';
  threshold: number; // 0 = fully present, 1 = fully dissolved; the animated clip level
  edgeColor: number; // packed sRgb RGBA of the glowing burn band. Default 0xff6600ff.
  edgeWidth?: number; // width of the edge band above the threshold, 0 = hard clip. Default 0.05.
  map?: Texture; // noise/mask source (red channel); omitted = procedural value noise over the UV
  scale?: number; // procedural-noise frequency (ignored when `map` is set). Default 8.
}

export const DissolveModifierKind = 'DissolveModifier';
