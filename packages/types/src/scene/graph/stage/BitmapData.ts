import type { ImageSource } from '../../../assets';
import type { PrimitiveData } from './PrimitiveData';

export interface BitmapData extends PrimitiveData {
  image: ImageSource | null;
  smoothing: boolean;
}
