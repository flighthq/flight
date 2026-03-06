import type { Graphics } from './Graphics';
import type { PrimitiveData } from './PrimitiveData';

export interface ShapeData extends PrimitiveData {
  graphics: Graphics;
}
