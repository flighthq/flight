import type { Modifier } from './Modifier';
import type { Texture } from './Texture';

// How an EmissiveModifier gates its contribution by surface facing. `Ignore` emits everywhere;
// `AwayFromLight` emits where the surface faces away from the dominant light (the night-side case —
// lit windows appear on the dark hemisphere); `TowardLight` is the complement. A small CLOSED
// vocabulary owned here — canonical PascalCase values, serialized verbatim, with no vendor-extension
// path — so it is a switch/typo-safe union (unlike the open `ModifierSlot` family), derived from the
// const so the two never drift.
export const EmissiveModifierFacing = {
  AwayFromLight: 'AwayFromLight',
  Ignore: 'Ignore',
  TowardLight: 'TowardLight',
} as const;

export type EmissiveModifierFacing = (typeof EmissiveModifierFacing)[keyof typeof EmissiveModifierFacing];

// Adds a self-illuminating contribution to the shaded output (slot: Emissive), with an optional mask
// and an optional facing gate. Generalizes the globe's night-side glow: emissive gated
// `AwayFromLight` shows city lights on the dark hemisphere. Also covers decals, light-maps, and lit
// windows. `color` is packed sRgb-albedo RGBA (0xrrggbbaa); `strength` scales linear radiance
// (values > 1 drive bloom on GPU backends).
export interface EmissiveModifier extends Modifier {
  kind: 'EmissiveModifier';
  slot: 'Emissive';
  color: number;
  strength: number;
  mask?: Texture; // optional mask modulating where emissive applies; omitted = unmasked
  facing?: EmissiveModifierFacing; // facing gate. Default EmissiveModifierFacing.Ignore.
  facingSoftness?: number; // terminator width for the facing gate, 0 = hard. Default 0.
}

export const EmissiveModifierKind = 'EmissiveModifier';
