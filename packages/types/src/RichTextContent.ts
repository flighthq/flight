import type { Entity } from './Entity.ts';
import type { TextFormatRange } from './TextFormatRange.ts';

export interface RichTextContent extends Entity {
  formatRanges: TextFormatRange[];
  text: string;
}
