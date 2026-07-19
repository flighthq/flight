import type { Modifier } from './Modifier';

// How a FogModifier maps camera distance to fog density. `Linear` ramps from 0 at `near` to full at
// `far`; `Exponential` follows `1 - exp(-density * d)`; `Exponential2` follows `1 - exp(-(density *
// d)^2)` (the classic OpenGL EXP2, a tighter ground-hugging falloff). A small CLOSED vocabulary owned
// here — canonical PascalCase, serialized verbatim, no vendor-extension path — so it is a switch-safe
// union derived from the const, unlike the open `ModifierSlot` family.
export const FogModifierMode = {
  Exponential: 'Exponential',
  Exponential2: 'Exponential2',
  Linear: 'Linear',
} as const;

export type FogModifierMode = (typeof FogModifierMode)[keyof typeof FogModifierMode];

// Blends the shaded output toward a fog color by camera-distance density (slot: Effect): the fragment
// world position is compared against the camera to derive depth, a factor is computed by `mode`, and
// the shaded radiance is `mix(radiance, fogColor, factor)`. Generalizes atmospheric haze, depth
// cueing, and underwater tint. `color` is packed sRgb RGBA. `Linear` uses `near`/`far` as the ramp
// endpoints; the exponential modes use `density` as the falloff rate (and ignore near/far). This is
// the per-material forward-shaded fog term — the compiled sibling of the post-process
// `ScreenSpaceFogEffect`, applied inline so it composes with the other modifiers in one pass.
export interface FogModifier extends Modifier {
  kind: 'FogModifier';
  slot: 'Effect';
  color: number;
  mode?: FogModifierMode; // distance-to-density curve. Default FogModifierMode.Linear.
  near?: number; // Linear: distance where fog begins (factor 0). Default 0.
  far?: number; // Linear: distance where fog is full (factor 1). Default 1.
  density?: number; // Exponential/Exponential2 falloff rate. Default 1.
}

export const FogModifierKind = 'FogModifier';
