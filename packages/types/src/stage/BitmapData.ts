import type { PrimitiveData } from './PrimitiveData';

export default interface BitmapData extends PrimitiveData {
  image: HTMLImageElement | null;
  smoothing: boolean;
}
