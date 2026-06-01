import type { TextFormatRange } from './TextFormatRange';

export interface RichTextContent {
  formatRanges: TextFormatRange[];
  text: string;
}
