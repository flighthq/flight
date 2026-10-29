// Generated from crates/flight-text/src/text_format_font.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { TextFormat } from '@flighthq/textformat/contract';

export function computeTextFormatFontString(format: Readonly<TextFormat>): string {
  const style = (format.italic ?? false) ? 'italic' : 'normal';
  const weight = (format.bold ?? false) ? 'bold' : 'normal';
  const size = format.size ?? 12.0;
  const family = format.font ?? 'sans-serif';
  return `${style} ${weight} ${size}px ${family}`;
}
