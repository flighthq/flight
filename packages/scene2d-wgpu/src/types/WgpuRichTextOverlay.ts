import type { RichText, TextLayoutResult } from '@flighthq/types/contract';

export type WgpuRichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;
