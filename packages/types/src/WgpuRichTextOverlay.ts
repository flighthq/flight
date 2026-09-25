import type { RichText } from './RichText.ts';
import type { TextLayoutResult } from './TextLayout.ts';

export type WgpuRichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;
