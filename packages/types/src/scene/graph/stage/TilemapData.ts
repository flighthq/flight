import type { Tileset } from '../../../assets';
import type { PrimitiveData } from './PrimitiveData';

export default interface TilemapData extends PrimitiveData {
  smoothing: boolean;
  tileAlphaEnabled: boolean;
  tileBlendModeEnabled: boolean;
  tileColorTransformEnabled: boolean;
  tileset: Tileset | null;
}
