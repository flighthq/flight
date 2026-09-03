import type { Entity } from './Entity';
import type { Signal } from './Signal';

// Optional observation for the mutable actor half. Signals are never stored on authored Statechart data;
// enableStatechartSignals attaches this group lazily to one instance instead.
export interface StatechartSignals extends Entity {
  onStateChange: Signal<(regionIndex: number, previousStateIndex: number, stateIndex: number) => void>;
}
