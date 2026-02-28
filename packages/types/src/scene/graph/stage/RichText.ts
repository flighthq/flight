import type RichTextData from './RichTextData';
import type Text from './Text';

export default interface RichText extends Text {
  data: RichTextData;
}
