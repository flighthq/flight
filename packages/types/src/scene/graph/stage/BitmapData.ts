import type { ImageSource } from '@flighthq/types';

import type { PrimitiveData } from './PrimitiveData';

export default interface BitmapData extends PrimitiveData {
  image: ImageSource | null;
  smoothing: boolean;
}
