import type { DropShadowEffect, OuterGlowEffect } from '@flighthq/types';

// Drop-shadow composite effect as a CSS `drop-shadow()` string (the same string the DOM backend emits).
// Knockout and anisotropic-blur (blurX !== blurY) variants have no CSS equivalent and return null.
// Offset is derived from angle (degrees, default 45) and distance (default 4), rounded to whole pixels.
export function computeDropShadowEffectCss(effect: Readonly<DropShadowEffect>): string | null {
  if (effect.knockout) return null;
  const blurX = effect.blurX ?? 4;
  const blurY = effect.blurY ?? 4;
  if (blurX !== blurY) return null;
  const angle = effect.angle ?? 45;
  const distance = effect.distance ?? 4;
  const radians = (angle * Math.PI) / 180;
  const dx = Math.round(Math.cos(radians) * distance);
  const dy = Math.round(Math.sin(radians) * distance);
  return `drop-shadow(${dx}px ${dy}px ${blurX}px ${cssRgbaFromColor(effect.color ?? 0, effect.alpha ?? 1)})`;
}

// Outer-glow composite effect as a centered (no offset) CSS `drop-shadow()` string.
// Knockout and anisotropic-blur (blurX !== blurY) variants have no CSS equivalent and return null.
export function computeOuterGlowEffectCss(effect: Readonly<OuterGlowEffect>): string | null {
  if (effect.knockout) return null;
  const blurX = effect.blurX ?? 6;
  const blurY = effect.blurY ?? 6;
  if (blurX !== blurY) return null;
  return `drop-shadow(0px 0px ${blurX}px ${cssRgbaFromColor(effect.color ?? 0xff0000, effect.alpha ?? 1)})`;
}

// Packed 0xRRGGBB integer + separate alpha to a CSS `rgba()` string (alpha fixed to 3 decimals).
function cssRgbaFromColor(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
