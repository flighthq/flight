import { Entity, getEntityWrapperAs } from '@flighthq/entity/contract';

import {
  clearFlowStack,
  createFlowStack,
  getActiveFlowState,
  getFlowStackDepth,
  getFlowStackVisibleStates,
  popFlowState,
  pushFlowState,
  replaceFlowState,
  updateFlowStack,
} from './flow.ts';
import type { FlowGuardStateRef } from './flow.ts';
import type { FlowStackRaw, FlowState } from './flowTypes.ts';

/** Entity/OOP companion for the tree-shakeable Flow stack free functions. */
export class FlowStack extends Entity {
  declare readonly raw: FlowStackRaw;

  constructor(raw: FlowStackRaw = createFlowStack()) {
    super(raw);
  }

  static override create(): FlowStack {
    return new FlowStack();
  }

  static override from(raw: FlowStackRaw): FlowStack {
    const existing = getEntityWrapperAs<Entity>(raw);
    if (existing === null) return new FlowStack(raw);
    if (existing instanceof FlowStack) return existing;
    throw new TypeError('FlowStackRaw is already attached to an incompatible OOP wrapper');
  }

  get states(): FlowState[] {
    return this.raw.states;
  }

  activeState(): FlowState | null {
    return getActiveFlowState(this.raw);
  }

  clearStack(): void {
    clearFlowStack(this.raw);
  }

  popState(): FlowState | null {
    return popFlowState(this.raw);
  }

  pushState(state: FlowState, guards: Readonly<FlowGuardStateRef>): void {
    pushFlowState(this.raw, state, guards);
  }

  replaceState(state: FlowState, guards: Readonly<FlowGuardStateRef>): void {
    replaceFlowState(this.raw, state, guards);
  }

  stackDepth(): number {
    return getFlowStackDepth(this.raw);
  }

  updateStack(deltaTime: number): void {
    updateFlowStack(this.raw, deltaTime);
  }

  visibleStates(out: FlowState[]): void {
    getFlowStackVisibleStates(out, this.raw);
  }
}
