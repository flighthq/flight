import type { ImageSource } from '../assets';
import type { PrimitiveData } from './PrimitiveData';

export default interface BitmapData extends PrimitiveData {
  image: ImageSource | null;
  smoothing: boolean;
}
