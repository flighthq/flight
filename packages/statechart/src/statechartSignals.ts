import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal } from '@flighthq/signals/contract';
import type { EntityConstruction, StatechartInstance, StatechartSignals } from '@flighthq/types/contract';

// Allocate the optional observer group on first use. The nullable slot lives on the mutable instance,
// never on the immutable chart, so authored/imported state remains closure-free and serializable. This
// module is separately tree-shakeable: count/read users do not pay for the signals runtime.
export function enableStatechartSignals(instance: StatechartInstance): StatechartSignals {
  return (instance.signals ??= (() => {
    const out = allocateEntity<StatechartSignals>();
    initializeStatechartSignals(out);
    return finishEntity(out);
  })());
}

// Read the optional observer group without allocating it. Returns null until enableStatechartSignals
// has been called for this actor.
export function getStatechartSignals(instance: Readonly<StatechartInstance>): StatechartSignals | null {
  return instance.signals;
}

export function initializeStatechartSignals(out: EntityConstruction<StatechartSignals>): void {
  out.onStateChange = createSignal();
}
