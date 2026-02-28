import type DisplayObject from './DisplayObject';
import type ShapeData from './ShapeData';

export default interface Shape extends DisplayObject {
  data: ShapeData;
}
