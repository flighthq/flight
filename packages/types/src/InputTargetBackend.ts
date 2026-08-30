import type { Entity } from './Entity';

// Provider-bound identity for a surface that accepts direct application input. Web maps this
// opaque value to an HTMLElement; neutral application and native-host contracts never name DOM.
export interface InputTargetHandle extends Entity {
  readonly __brand: 'InputTargetHandle';
}

export interface InputTargetBackend extends Entity {
  prepare(target: InputTargetHandle): void;
}
