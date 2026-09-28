import { clamp } from '@flighthq/math/contract';
import type { SvgColor } from '@flighthq/types/contract';

import {} from './svgXml.ts';

/**
 * SVG's colour vocabulary: hex, `rgb()`, `hsl()`, the named table, `none` and `currentColor`.
 *
 * ★ `currentColor` IS WHY THIS TAKES A SECOND ARGUMENT. A colour in SVG can defer to the inherited `color` property,
 * so resolving one needs the cascade's current value — which is the only reason the colour parser and the style
 * cascade know about each other at all.
 *
 * `null` means `none`, and that is a value rather than a failure: `fill="none"` is a shape that is drawn and not
 * filled, which a caller must be able to tell from a colour it failed to read.
 */
export function parseSvgColor(value: string): SvgColor | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'none' || normalized === 'transparent') return null;
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return Number.isNaN(r + g + b + a) ? null : { alpha: a, rgb: (r << 16) | (g << 8) | b };
    }
    if (hex.length === 6 || hex.length === 8) {
      const rgb = Number.parseInt(hex.slice(0, 6), 16);
      const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
      return Number.isNaN(rgb + alpha) ? null : { alpha, rgb };
    }
  }
  const functionMatch = /^(rgba?|hsla?)\((.*)\)$/.exec(normalized);
  if (functionMatch !== null) {
    const components = functionMatch[2].split(/[\s,/]+/).filter(Boolean);
    if ((functionMatch[1] === 'rgb' || functionMatch[1] === 'rgba') && components.length >= 3) {
      const component = (index: number): number => {
        const text = components[index];
        return text.endsWith('%') ? (Number.parseFloat(text) * 255) / 100 : Number.parseFloat(text);
      };
      const r = Math.round(clamp(component(0), 0, 255));
      const g = Math.round(clamp(component(1), 0, 255));
      const b = Math.round(clamp(component(2), 0, 255));
      const alpha = components[3] === undefined ? 1 : parseCssAlpha(components[3]);
      if (Number.isFinite(r + g + b + alpha)) return { alpha, rgb: (r << 16) | (g << 8) | b };
    }
    if ((functionMatch[1] === 'hsl' || functionMatch[1] === 'hsla') && components.length >= 3) {
      const hue = parseCssHue(components[0]);
      const saturation = parseCssFraction(components[1]);
      const lightness = parseCssFraction(components[2]);
      const alpha = components[3] === undefined ? 1 : parseCssAlpha(components[3]);
      if (Number.isFinite(hue + saturation + lightness + alpha)) {
        return { alpha, rgb: hslToRgb(hue, saturation, lightness) };
      }
    }
  }
  const named = svgNamedColors[normalized];
  return named === undefined ? null : { alpha: 1, rgb: named };
}

function parseCssAlpha(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return clamp(value.endsWith('%') ? parsed / 100 : parsed, 0, 1);
}

function parseCssFraction(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return clamp(value.endsWith('%') ? parsed / 100 : parsed, 0, 1);
}

function parseCssHue(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (value.endsWith('turn')) return parsed * 360;
  if (value.endsWith('grad')) return parsed * 0.9;
  if (value.endsWith('rad')) return (parsed * 180) / Math.PI;
  return parsed;
}

function hslToRgb(hue: number, saturation: number, lightness: number): number {
  const normalizedHue = (((hue % 360) + 360) % 360) / 60;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((normalizedHue % 2) - 1));
  const [red, green, blue] =
    normalizedHue < 1
      ? [chroma, secondary, 0]
      : normalizedHue < 2
        ? [secondary, chroma, 0]
        : normalizedHue < 3
          ? [0, chroma, secondary]
          : normalizedHue < 4
            ? [0, secondary, chroma]
            : normalizedHue < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return (
    (Math.round((red + offset) * 255) << 16) |
    (Math.round((green + offset) * 255) << 8) |
    Math.round((blue + offset) * 255)
  );
}

export function resolveSvgColor(value: string, currentColor: string): SvgColor | null {
  return parseSvgColor(value.trim().toLowerCase() === 'currentcolor' ? currentColor : value);
}

const svgNamedColors: Readonly<Record<string, number>> = {
  aqua: 0x00ffff,
  black: 0x000000,
  blue: 0x0000ff,
  cyan: 0x00ffff,
  fuchsia: 0xff00ff,
  gray: 0x808080,
  green: 0x008000,
  grey: 0x808080,
  lime: 0x00ff00,
  magenta: 0xff00ff,
  maroon: 0x800000,
  navy: 0x000080,
  olive: 0x808000,
  orange: 0xffa500,
  purple: 0x800080,
  red: 0xff0000,
  silver: 0xc0c0c0,
  teal: 0x008080,
  white: 0xffffff,
  yellow: 0xffff00,
};
