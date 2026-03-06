import type { Timeline } from '../../../animation/timeline';
import type { PrimitiveData } from './PrimitiveData';

export interface MovieClipData extends PrimitiveData {
  timeline: Timeline | null;
}
