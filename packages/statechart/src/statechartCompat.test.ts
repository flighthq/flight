import { Entity } from '@flighthq/entity/contract';
import { createLogState } from '@flighthq/log/contract';
import { connectSignal } from '@flighthq/signals/contract';

import {
  createStatechartInstance,
  getStatechartInputIndex,
  getStatechartRegionBlend,
  getStatechartRegionState,
} from './statechart.ts';
import { Statechart, StatechartInstance } from './statechartCompat.ts';
import { StatechartAtomicStateKind, StatechartInputKind, StatechartTransitionStatus } from './types.ts';
import type { StatechartRaw } from './types.ts';

describe('Statechart', () => {
  it('provides class-correct constructor and create defaults compatible with Entity', () => {
    const constructed = new Statechart();
    const created = Statechart.create();
    const entityClass: typeof Entity = Statechart;
    const baseCreated = entityClass.create();

    expect(constructed).toBeInstanceOf(Statechart);
    expect(constructed.raw).toEqual({ inputs: [], regions: [] });
    expect(created).toBeInstanceOf(Statechart);
    expect(created.raw).toEqual({ inputs: [], regions: [] });
    expect(baseCreated).toBeInstanceOf(Statechart);
    expectTypeOf(constructed).toEqualTypeOf<Statechart>();
    expectTypeOf(created).toEqualTypeOf<Statechart>();
    expectTypeOf(baseCreated).toEqualTypeOf<Entity>();
  });

  it('returns one stable typed wrapper without replacing the authored graph identity', () => {
    const raw = chart();
    const wrapper = Statechart.from(raw);

    expect(wrapper.raw).toBe(raw);
    expect(Statechart.from(raw)).toBe(wrapper);
    expect(Entity.from(raw)).toBe(wrapper);
    expect(wrapper.inputs).toBe(raw.inputs);
    expect(wrapper.regions).toBe(raw.regions);
    expect(wrapper.name).toBe(raw.name);
    expect(wrapper.getInputIndex('speed')).toBe(getStatechartInputIndex(raw, 'speed'));
  });

  it('rejects generic-first and incompatible typed-wrapper collisions', () => {
    const genericRaw = chart();
    const generic = Entity.from(genericRaw);

    expect(() => Statechart.from(genericRaw)).toThrow(
      new TypeError('StatechartRaw is already attached to an incompatible OOP wrapper'),
    );
    expect(Entity.from(genericRaw)).toBe(generic);

    const typedRaw = chart();
    const other = new OtherEntity(typedRaw);
    expect(() => Statechart.from(typedRaw)).toThrow(TypeError);
    expect(Entity.from(typedRaw)).toBe(other);
  });
});

describe('StatechartInstance', () => {
  it('provides class-correct constructor and create defaults compatible with Entity', () => {
    const constructed = new StatechartInstance();
    const created = StatechartInstance.create();
    const entityClass: typeof Entity = StatechartInstance;
    const baseCreated = entityClass.create();

    expect(constructed).toBeInstanceOf(StatechartInstance);
    expect(constructed.raw.chart).toEqual({ inputs: [], regions: [] });
    expect(created).toBeInstanceOf(StatechartInstance);
    expect(created.raw.chart).toEqual({ inputs: [], regions: [] });
    expect(baseCreated).toBeInstanceOf(StatechartInstance);
    expectTypeOf(constructed).toEqualTypeOf<StatechartInstance>();
    expectTypeOf(created).toEqualTypeOf<StatechartInstance>();
    expectTypeOf(baseCreated).toEqualTypeOf<Entity>();
  });

  it('returns one stable typed wrapper without replacing the raw actor identity', () => {
    const raw = createStatechartInstance(chart());
    const wrapper = StatechartInstance.from(raw);

    expect(wrapper.raw).toBe(raw);
    expect(StatechartInstance.from(raw)).toBe(wrapper);
    expect(Entity.from(raw)).toBe(wrapper);
  });

  it('rejects generic-first and incompatible typed-wrapper collisions', () => {
    const genericRaw = createStatechartInstance(chart());
    const generic = Entity.from(genericRaw);

    expect(() => StatechartInstance.from(genericRaw)).toThrow(
      new TypeError('StatechartInstanceRaw is already attached to an incompatible OOP wrapper'),
    );
    expect(Entity.from(genericRaw)).toBe(generic);

    const typedRaw = createStatechartInstance(chart());
    const other = new OtherEntity(typedRaw);
    expect(() => StatechartInstance.from(typedRaw)).toThrow(TypeError);
    expect(Entity.from(typedRaw)).toBe(other);
  });

  it('delegates method sugar and buffer access to the same raw actor as the free functions', () => {
    const definition = Statechart.from(chart());
    const instance = StatechartInstance.create(definition);

    expect(instance.chart).toBe(definition.raw);
    expect(instance.inputValues).toBe(instance.raw.inputValues);
    expect(instance.regionBlendValues).toBe(instance.raw.regionBlend);
    expect(instance.regionDuration).toBe(instance.raw.regionDuration);
    expect(instance.regionElapsed).toBe(instance.raw.regionElapsed);
    expect(instance.regionStates).toBe(instance.raw.regionStates);
    expect(instance.regionTransitions).toBe(instance.raw.regionTransitions);
    expect(instance.regionBlend(0)).toBe(getStatechartRegionBlend(instance.raw, 0));
    expect(instance.regionState(0)).toBe(getStatechartRegionState(instance.raw, 0));

    instance.setNumberInput(0, 4);
    instance.fireTrigger(1);
    instance.setBooleanInput(2, true);
    instance.setRegionDuration(0, 100);
    expect(Array.from(instance.inputValues)).toEqual([4, 1, 1]);
    expect(instance.regionDuration[0]).toBe(100);
    expect(instance.explainTransition(0).status).toBe(StatechartTransitionStatus.Ready);

    const received: number[][] = [];
    const signals = instance.enableSignals();
    connectSignal(signals.onStateChange, (payload) => received.push([...payload]));
    expect(instance.getSignals()).toBe(signals);
    expect(instance.signals).toBe(signals);

    const logState = createLogState();
    instance.enableGuards(logState, () => 0);
    expect(instance.guardsEnabled()).toBe(true);
    instance.disableGuards();
    expect(instance.guardsEnabled()).toBe(false);

    expect(instance.advance(0)).toBe(1);
    expect(instance.regionState(0)).toBe(1);
    expect(received).toEqual([[0, 0, 1]]);
  });
});

class OtherEntity extends Entity {}

function chart(): StatechartRaw {
  return {
    inputs: [
      { initialValue: 0, kind: StatechartInputKind.Number, name: 'speed' },
      { initialValue: 0, kind: StatechartInputKind.Trigger, name: 'go' },
      { initialValue: 0, kind: StatechartInputKind.Boolean, name: 'enabled' },
    ],
    name: 'Test',
    regions: [
      {
        initialStateIndex: 0,
        states: [
          {
            kind: StatechartAtomicStateKind,
            transitions: [{ conditions: [], durationMs: 0, exitTimeRatio: -1, targetStateIndex: 1 }],
          },
          { kind: StatechartAtomicStateKind, transitions: [] },
        ],
      },
    ],
  };
}
