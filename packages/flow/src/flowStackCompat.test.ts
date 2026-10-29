import { Entity } from '@flighthq/entity/contract';

import {
  createFlowStack,
  getActiveFlowState,
  getFlowStackDepth,
  getFlowStackVisibleStates,
  popFlowState,
} from './flow.ts';
import { FlowStack } from './flowStackCompat.ts';
import type { FlowState } from './flowTypes.ts';
import type { FlowGuardState } from './types.ts';

describe('FlowStack', () => {
  it('provides class-correct constructor and create defaults compatible with Entity', () => {
    const constructed = new FlowStack();
    const created = FlowStack.create();
    const entityClass: typeof Entity = FlowStack;
    const baseCreated = entityClass.create();

    expect(constructed).toBeInstanceOf(FlowStack);
    expect(constructed.raw.states).toEqual([]);
    expect(created).toBeInstanceOf(FlowStack);
    expect(created.raw.states).toEqual([]);
    expect(baseCreated).toBeInstanceOf(FlowStack);
    expectTypeOf(constructed).toEqualTypeOf<FlowStack>();
    expectTypeOf(created).toEqualTypeOf<FlowStack>();
    expectTypeOf(baseCreated).toEqualTypeOf<Entity>();
  });

  it('returns one stable typed wrapper without replacing the raw stack identity', () => {
    const raw = createFlowStack();
    const wrapper = FlowStack.from(raw);

    expect(wrapper.raw).toBe(raw);
    expect(FlowStack.from(raw)).toBe(wrapper);
    expect(Entity.from(raw)).toBe(wrapper);
  });

  it('rejects generic-first and incompatible typed-wrapper collisions', () => {
    const genericRaw = createFlowStack();
    const generic = Entity.from(genericRaw);

    expect(() => FlowStack.from(genericRaw)).toThrow(
      new TypeError('FlowStackRaw is already attached to an incompatible OOP wrapper'),
    );
    expect(Entity.from(genericRaw)).toBe(generic);

    const typedRaw = createFlowStack();
    const other = new OtherEntity(typedRaw);
    expect(() => FlowStack.from(typedRaw)).toThrow(TypeError);
    expect(Entity.from(typedRaw)).toBe(other);
  });

  it('delegates method sugar to the same raw stack as the free functions', () => {
    const stack = FlowStack.create();
    const guards = guardState();
    const calls: string[] = [];
    const lower: FlowState = { name: 'lower', onUpdate: () => calls.push('lower') };
    const top: FlowState = {
      name: 'top',
      onUpdate: () => calls.push('top'),
      renderBelow: true,
      updateBelow: true,
    };

    stack.pushState(lower, guards);
    stack.pushState(top, guards);
    expect(stack.states).toBe(stack.raw.states);
    expect(stack.activeState()).toBe(getActiveFlowState(stack.raw));
    expect(stack.stackDepth()).toBe(getFlowStackDepth(stack.raw));

    const viaMethod: FlowState[] = [];
    const viaFree: FlowState[] = [];
    stack.visibleStates(viaMethod);
    getFlowStackVisibleStates(viaFree, stack.raw);
    expect(viaMethod).toEqual(viaFree);

    stack.updateStack(0.016);
    expect(calls).toEqual(['top', 'lower']);

    const replacement: FlowState = { name: 'replacement' };
    stack.replaceState(replacement, guards);
    expect(getActiveFlowState(stack.raw)).toBe(replacement);
    expect(stack.popState()).toBe(replacement);
    expect(popFlowState(stack.raw)).toBe(lower);
    expect(stack.popState()).toBeNull();

    stack.pushState(lower, guards);
    stack.clearStack();
    expect(getFlowStackDepth(stack.raw)).toBe(0);
  });
});

class OtherEntity extends Entity {}

function guardState(): FlowGuardState {
  return { context: null, enabled: false, transitionDepth: 0 };
}
