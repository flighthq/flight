import type { Signal } from './Signal';
import type { TextShaperBackend } from './TextShaper';
export interface TextShaperSignals {
  onBackendChanged: Signal<(backend: TextShaperBackend | null) => void>;
}
