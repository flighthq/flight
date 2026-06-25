export type TextFormatAlign = 'center' | 'end' | 'justify' | 'left' | 'right' | 'start';

// The glyph drawn at the start of a bulleted paragraph. 'none' suppresses the marker glyph while
// keeping the paragraph indent; an absent value defaults to the filled disc bullet.
export type TextFormatListMarker = 'circle' | 'decimal' | 'disc' | 'none' | 'square';

export interface TextFormat {
  align?: TextFormatAlign;
  blockIndent?: number;
  bold?: boolean;
  bullet?: boolean;
  color?: number;
  font?: string;
  indent?: number;
  italic?: boolean;
  kerning?: boolean;
  leading?: number;
  leftMargin?: number;
  letterSpacing?: number;
  listMarker?: TextFormatListMarker;
  rightMargin?: number;
  size?: number;
  strikethrough?: boolean;
  tabStops?: number[];
  target?: string;
  underline?: boolean;
  url?: string;
}
