import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';
import type { HostTextShaperCapability } from './TextShaper.ts';
export interface TextShaperSignals extends Entity {
  onBackendChanged: Signal<(backend: HostTextShaperCapability | null) => void>;
}
