import type Tileset from '../assets/Tileset';
import type { PrimitiveData } from './PrimitiveData';

export default interface TilemapData extends PrimitiveData {
  smoothing: boolean;
  tileAlphaEnabled: boolean;
  tileBlendModeEnabled: boolean;
  tileColorTransformEnabled: boolean;
  tileset: Tileset | null;
}
