import type { Entity } from './Entity.ts';
import type { RichText } from './RichText.ts';

export interface SelectableRichTextManager extends Entity {
  focused: RichText | null;
}
