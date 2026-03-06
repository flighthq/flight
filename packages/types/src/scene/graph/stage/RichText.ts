import type { RichTextData } from './RichTextData';
import type { Text } from './Text';

export interface RichText extends Text {
  data: RichTextData;
}
