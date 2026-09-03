import type { Entity } from './Entity';
import type { TextFormatRange } from './TextFormatRange';

export interface RichTextContent extends Entity {
  formatRanges: TextFormatRange[];
  text: string;
}
