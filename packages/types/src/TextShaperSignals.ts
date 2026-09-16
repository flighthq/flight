import type { Entity } from './Entity';
import type { Signal } from './Signal';
import type { HostTextShaperCapability } from './TextShaper';
export interface TextShaperSignals extends Entity {
  onBackendChanged: Signal<(backend: HostTextShaperCapability | null) => void>;
}
