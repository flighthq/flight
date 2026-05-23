export type TextFormatAlign = 'center' | 'end' | 'justify' | 'left' | 'right' | 'start';

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
  rightMargin?: number;
  size?: number;
  tabStops?: number[];
  underline?: boolean;
}
