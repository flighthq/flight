import type { Tileset } from '@flighthq/types';

import type { PrimitiveData } from './PrimitiveData';

export default interface TilemapData extends PrimitiveData {
  smoothing: boolean;
  tileAlphaEnabled: boolean;
  tileBlendModeEnabled: boolean;
  tileColorTransformEnabled: boolean;
  tileset: Tileset | null;
}
