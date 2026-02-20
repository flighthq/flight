import type DisplayObject from './DisplayObject';
import type RichTextData from './RichTextData';

export default interface RichText extends DisplayObject {
  data: RichTextData;
}
