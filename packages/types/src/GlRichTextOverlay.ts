import type { RichText } from './RichText';
import type { TextLayoutResult } from './TextLayout';

export type GlRichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;
