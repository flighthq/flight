import type { Entity } from './Entity';

// Provider-bound identity for a surface that accepts direct application input. Web maps this opaque value
// to an HTMLElement; neutral application and native-host contracts never name DOM. Deliberately separate
// from a rendering Surface: input is addressed to a region that may not draw at all, and a drawable may
// take no input, so unifying them asserts a correspondence neither side guarantees.
export interface InputTargetHandle extends Entity {
  readonly __brand: 'InputTargetHandle';
}

// One-time host preparation of a target for direct application input: suppressing platform gestures,
// selection, and tap highlighting. Separate from the event capabilities because a host may need the
// preparation without emitting any of those events itself.
export interface HostInputTargetCapability extends Entity {
  prepare(target: InputTargetHandle): void;
}
