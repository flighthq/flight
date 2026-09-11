import type { Entity } from './Entity';
import type { Signal } from './Signal';
import type { HostTextShaperProvider } from './TextShaper';
export interface TextShaperSignals extends Entity {
  onBackendChanged: Signal<(backend: HostTextShaperProvider | null) => void>;
}
