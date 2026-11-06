import type { RichText } from '@flighthq/text/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';

export type WgpuRichTextOverlay = (
  context: CanvasRenderingContext2D,
  source: RichText,
  result: TextLayoutResult,
  fieldW: number,
  fieldH: number,
  text: string,
) => void;
