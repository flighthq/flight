import type { Entity } from './Entity';

// Provider-bound identity for a surface that accepts direct application input. Web maps this
// opaque value to an HTMLElement; neutral application and native-host contracts never name DOM.
export interface HostTarget extends Entity {
  readonly __brand: 'HostTarget';
}

export interface HostTargetCapability extends Entity {
  prepare(target: HostTarget): void;
}
