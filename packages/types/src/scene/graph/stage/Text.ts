import type DisplayObject from './DisplayObject';
import type TextData from './TextData';

export default interface Text extends DisplayObject {
  data: TextData;
}
