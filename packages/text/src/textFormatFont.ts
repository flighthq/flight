import type { TextFormat } from '@flighthq/types';

export function computeTextFormatFontString(format: TextFormat): string {
  const style = format.italic ? 'italic' : 'normal';
  const weight = format.bold ? 'bold' : 'normal';
  const size = format.size ?? 12;
  const family = format.font ?? 'sans-serif';
  return `${style} ${weight} ${size}px ${family}`;
}
