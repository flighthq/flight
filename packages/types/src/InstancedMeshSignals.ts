import type { Entity } from './Entity';
import type { Signal } from './Signal';

// Opt-in observation of an InstancedMesh's instance list, enabled per node by
// enableInstancedMeshSignals and costing nothing until it is.
//
// This is a DIFFERENT channel from the `version` counter, and the two answer different questions.
// `version` says "the instance payload changed" and is what a cache (the cull's bounds union, a
// backend's upload) keys on — it fires for a matrix edit as readily as for an append. These signals
// say WHICH structural edit happened and WHERE, which is what a consumer maintaining an array
// parallel to the instances needs: `onInstanceRemoved` carries the swap source precisely because a
// removal is a swap with the last instance, so a parallel array must move the same element.
export interface InstancedMeshSignals extends Entity {
  onCleared: Signal<() => void>;
  onInstanceAppended: Signal<(index: number) => void>;
  onInstanceRemoved: Signal<(index: number, swapSource: number) => void>;
}
