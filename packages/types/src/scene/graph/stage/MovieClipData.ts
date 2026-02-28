import type { Timeline } from '@flighthq/types';

import type PrimitiveData from './PrimitiveData';

export default interface MovieClipData extends PrimitiveData {
  timeline: Timeline | null;
}
