import type { TextFormat } from '@flighthq/types';

export function colorToCSS(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function formatToFont(format: TextFormat): string {
  const style = format.italic ? 'italic' : 'normal';
  const weight = format.bold ? 'bold' : 'normal';
  const size = format.size ?? 12;
  const family = format.font ?? 'serif';
  return `${style} ${weight} ${size}px ${family}`;
}

export function htmlEscape(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}
