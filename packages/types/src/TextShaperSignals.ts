import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';
import type { HostTextShaperCapability } from './TextShaper.ts';
export interface TextShaperSignals extends Entity {
  onBackendChanged: Signal<(backend: HostTextShaperCapability | null) => void>;
}
