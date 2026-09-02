import { lerpColor } from '@flighthq/color/contract';
import type { RenderEffect, RenderEffectFieldRoles } from '@flighthq/types/contract';

// Animation-friendly interpolation for render-effect intents. Allows tween/timeline to animate
// effect parameters smoothly across keyframes. All functions are alias-safe.

// Returns true if `a` and `b` can be interpolated: they must be the same `kind`.
// A mismatch (different kinds, or either undefined) returns false — callers should snap in that case.
export function canLerpRenderEffects(a: Readonly<RenderEffect>, b: Readonly<RenderEffect>): boolean {
  return a.kind === b.kind;
}

// Which numeric fields on each SDK effect kind are packed sRGB RGBA rather than scalars. Derived from
// the field declarations in @flighthq/types, where every one of these carries a "Packed sRGB RGBA"
// comment. A caller with vendor effect kinds spreads its own entries over this table; a kind that is
// absent is treated as all-scalar, which is the pre-existing behaviour rather than a new guess.
export const RENDER_EFFECT_FIELD_ROLES: RenderEffectFieldRoles = {
  BevelEffect: { highlightColor: 'packedColor', shadowColor: 'packedColor' },
  ConvolutionEffect: { color: 'packedColor' },
  DropShadowEffect: { color: 'packedColor' },
  InnerGlowEffect: { color: 'packedColor' },
  InnerShadowEffect: { color: 'packedColor' },
  OuterGlowEffect: { color: 'packedColor' },
  OutlineEffect: { color: 'packedColor' },
  ScreenSpaceFogEffect: { color: 'packedColor' },
  VignetteEffect: { color: 'packedColor' },
  VolumetricLightEffect: { lightColor: 'packedColor' },
};

// Linearly interpolates all numeric fields between two effects of the same kind, writing the
// result into `out`. Boolean fields snap to `a`'s value (t < 0.5) or `b`'s value (t >= 0.5).
// Enum/string fields snap at t = 0.5. Readonly arrays (e.g. mipWeights) are not interpolated —
// `out` receives `a`'s value for t < 0.5, `b`'s otherwise.
//
// The `out` parameter must be the same kind as `a` and `b`; its existing fields are overwritten.
// If `a.kind !== b.kind`, `out` is left unchanged and the function returns false.
// Returns true on success, false on kind mismatch. Never throws.
// Alias-safe: reads all values from `a` and `b` before writing to `out` (safe if out === a or out === b).
//
// Fields declared `packedColor` by `roles` interpolate per channel through `lerpColor` — which unpacks,
// interpolates in linear space, and repacks — rather than as scalars. Lerping a packed integer borrows
// across byte boundaries: halfway between 0xff0000ff and 0x0000ffff is 0x7f8080ff, a grey-blue whose
// green channel neither endpoint has.
export function lerpRenderEffect(
  a: Readonly<RenderEffect>,
  b: Readonly<RenderEffect>,
  t: number,
  out: RenderEffect,
  roles: RenderEffectFieldRoles = RENDER_EFFECT_FIELD_ROLES,
): boolean {
  if (a.kind !== b.kind) return false;
  const tc = Math.max(0, Math.min(1, t));
  // Collect all numeric keys from both effects before writing.
  const numericKeys = new Set<string>();
  const booleanKeys = new Set<string>();
  const stringKeys = new Set<string>();
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  for (const key of Object.keys(aRec)) {
    if (key === 'kind') continue;
    const va = aRec[key];
    const vb = bRec[key];
    if (typeof va === 'number' || typeof vb === 'number') {
      numericKeys.add(key);
    } else if (typeof va === 'boolean' || typeof vb === 'boolean') {
      booleanKeys.add(key);
    } else if (typeof va === 'string' || typeof vb === 'string') {
      stringKeys.add(key);
    }
  }
  for (const key of Object.keys(bRec)) {
    if (key === 'kind') continue;
    if (!numericKeys.has(key) && !booleanKeys.has(key) && !stringKeys.has(key)) {
      const vb = bRec[key];
      if (typeof vb === 'number') numericKeys.add(key);
      else if (typeof vb === 'boolean') booleanKeys.add(key);
      else if (typeof vb === 'string') stringKeys.add(key);
    }
  }
  // Read snapshot from a and b, then write to out.
  const outRecord = out as unknown as Record<string, unknown>;
  const kindRoles = roles[a.kind as string];
  for (const key of numericKeys) {
    const va = aRec[key] as number | undefined;
    const vb = bRec[key] as number | undefined;
    if (va === undefined || vb === undefined) {
      outRecord[key] = tc < 0.5 ? va : vb;
      continue;
    }
    outRecord[key] = kindRoles?.[key] === 'packedColor' ? lerpColor(va, vb, tc) : va + (vb - va) * tc;
  }
  for (const key of booleanKeys) {
    outRecord[key] = tc < 0.5 ? aRec[key] : bRec[key];
  }
  for (const key of stringKeys) {
    outRecord[key] = tc < 0.5 ? aRec[key] : bRec[key];
  }
  return true;
}
