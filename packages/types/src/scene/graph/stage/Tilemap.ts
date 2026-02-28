import type DisplayObject from './DisplayObject';
import type TilemapData from './TilemapData';

export default interface Tilemap extends DisplayObject {
  data: TilemapData;
}
