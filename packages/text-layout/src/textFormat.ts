import type { TextFormat } from '@flighthq/types';

const DEFAULT_SIZE = 12;

export function getFormatAscent(format: TextFormat): number {
  return format.size ?? DEFAULT_SIZE;
}

export function getFormatDescent(format: TextFormat): number {
  return (format.size ?? DEFAULT_SIZE) * 0.185;
}

export function getFormatHeight(format: TextFormat): number {
  return getFormatAscent(format) + getFormatDescent(format) + getFormatLeading(format);
}

export function getFormatLeading(format: TextFormat): number {
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
