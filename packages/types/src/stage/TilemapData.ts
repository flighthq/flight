import type { PrimitiveData } from './PrimitiveData';
import type Tileset from './Tileset';

export default interface TilemapData extends PrimitiveData {
  smoothing: boolean;
  tileAlphaEnabled: boolean;
  tileBlendModeEnabled: boolean;
  tileColorTransformEnabled: boolean;
  tileset: Tileset;
}
