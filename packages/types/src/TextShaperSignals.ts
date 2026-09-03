import type { Entity } from './Entity';
import type { Signal } from './Signal';
import type { TextShaperBackend } from './TextShaper';
export interface TextShaperSignals extends Entity {
  onBackendChanged: Signal<(backend: TextShaperBackend | null) => void>;
}
