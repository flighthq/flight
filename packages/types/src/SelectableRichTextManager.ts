import type { Entity } from './Entity';
import type { RichText } from './RichText';

export interface SelectableRichTextManager extends Entity {
  focused: RichText | null;
}
