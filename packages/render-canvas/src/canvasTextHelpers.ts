import type { TextFormat } from '@flighthq/types';

export function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function formatToCanvasFont(format: TextFormat): string {
  const style = format.italic ? 'italic' : 'normal';
  const weight = format.bold ? 'bold' : 'normal';
  const size = format.size ?? 12;
  const family = format.font ?? 'serif';
  return `${style} ${weight} ${size}px ${family}`;
}
