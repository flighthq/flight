import type Graphics from './Graphics';
import type { PrimitiveData } from './PrimitiveData';

export default interface ShapeData extends PrimitiveData {
  graphics: Graphics;
}
