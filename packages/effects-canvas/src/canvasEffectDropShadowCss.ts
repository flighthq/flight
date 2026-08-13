import { getColorAlpha, getColorRgb } from '@flighthq/color/contract';
import type { DropShadowEffect, OuterGlowEffect } from '@flighthq/types/contract';

// Drop-shadow composite effect as a CSS `drop-shadow()` string (the same string the DOM backend emits).
// Only sourceMode 'draw' and isotropic blur can be represented by CSS-only drop-shadow().
// Offset is derived from angle (degrees, default 45) and distance (default 4), rounded to whole pixels.
export function computeDropShadowEffectCss(effect: Readonly<DropShadowEffect>): string | null {
  if ((effect.sourceMode ?? 'draw') !== 'draw') return null;
  const blurX = effect.blurX ?? 4;
  const blurY = effect.blurY ?? 4;
  if (blurX !== blurY) return null;
  const angle = effect.angle ?? 45;
  const distance = effect.distance ?? 4;
  const radians = (angle * Math.PI) / 180;
  const dx = Math.round(Math.cos(radians) * distance);
  const dy = Math.round(Math.sin(radians) * distance);
  // Packed RGBA whose alpha multiplies the separate alpha field. The helper below still takes RGB
  // because computeOuterGlowEffectCss shares it and OuterGlowEffect.color has not migrated.
  const packed = effect.color ?? 0x000000ff;
  return `drop-shadow(${dx}px ${dy}px ${blurX}px ${cssRgbaFromColor(getColorRgb(packed), (effect.alpha ?? 1) * getColorAlpha(packed))})`;
}

// Outer-glow composite effect as a centered (no offset) CSS `drop-shadow()` string.
// Only sourceMode 'draw' and isotropic blur can be represented by CSS-only drop-shadow().
export function computeOuterGlowEffectCss(effect: Readonly<OuterGlowEffect>): string | null {
  if ((effect.sourceMode ?? 'draw') !== 'draw') return null;
  const blurX = effect.blurX ?? 6;
  const blurY = effect.blurY ?? 6;
  if (blurX !== blurY) return null;
  return `drop-shadow(0px 0px ${blurX}px ${cssRgbaFromColor(effect.color ?? 0xff0000, effect.alpha ?? 1)})`;
}

// A 24-bit RGB integer plus a separate alpha to a CSS `rgba()` string (alpha fixed to 3 decimals).
// Callers holding a packed RGBA color split it with getColorRgb/getColorAlpha before calling.
function cssRgbaFromColor(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
