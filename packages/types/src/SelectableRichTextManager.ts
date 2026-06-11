import type { RichText } from './RichText';

export interface SelectableRichTextManager {
  focused: RichText | null;
}
