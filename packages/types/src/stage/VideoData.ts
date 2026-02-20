import type { PrimitiveData } from './PrimitiveData';

export default interface VideoData extends PrimitiveData {
  deblocking: number;
  smoothing: boolean;
}
