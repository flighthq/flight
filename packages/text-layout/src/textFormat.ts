import type { TextFormat } from '@flighthq/types';

const DEFAULT_SIZE = 12;

export function getTextFormatAscent(format: TextFormat): number {
  return format.size ?? DEFAULT_SIZE;
}

export function getTextFormatDescent(format: TextFormat): number {
  return (format.size ?? DEFAULT_SIZE) * 0.185;
}

export function getTextFormatHeight(format: TextFormat): number {
  return getTextFormatAscent(format) + getTextFormatDescent(format) + getTextFormatLeading(format);
}

export function getTextFormatLeading(format: TextFormat): number {
  return format.leading ?? 0;
}

export function mergeTextFormat(base: TextFormat, override: TextFormat): TextFormat {
  const result: TextFormat = { ...base };
  for (const key of Object.keys(override) as (keyof TextFormat)[]) {
    const value = override[key];
    if (value != null) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
