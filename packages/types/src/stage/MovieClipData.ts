import type Timeline from '../timeline/Timeline';
import type PrimitiveData from './PrimitiveData';

export default interface MovieClipData extends PrimitiveData {
  timeline: Timeline | null;
}
