import type PrimitiveData from './PrimitiveData';
import type Timeline from './Timeline';

export default interface MovieClipData extends PrimitiveData {
  timeline: Timeline | null;
}
