import { createStatechartInstance, getStatechartRegionBlend, getStatechartRegionState } from './statechart.ts';
import { StatechartAtomicStateKind } from './types.ts';
import type { StatechartRaw } from './types.ts';

describe('Statechart integer domain', () => {
  it('rejects a fractional authored initialStateIndex', () => {
    const raw = chart();
    raw.regions[0]!.initialStateIndex = 0.5;

    expect(() => createStatechartInstance(raw)).toThrow(RangeError);
  });

  it('rejects a fractional authored targetStateIndex', () => {
    const raw = chart();
    raw.regions[0]!.states[0]!.transitions[0]!.targetStateIndex = 0.5;

    expect(() => createStatechartInstance(raw)).toThrow(RangeError);
  });

  it('returns the blend sentinel for a fractional region index', () => {
    const instance = createStatechartInstance(chart());

    expect(getStatechartRegionBlend(instance, 0.5)).toBe(-1);
  });

  it('returns the state sentinel for a fractional region index', () => {
    const instance = createStatechartInstance(chart());

    expect(getStatechartRegionState(instance, 0.5)).toBe(-1);
  });
});

function chart(): Mutable<StatechartRaw> {
  return {
    inputs: [],
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

type Mutable<Type> = {
  -readonly [Key in keyof Type]: Type[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : Type[Key] extends object
      ? Mutable<Type[Key]>
      : Type[Key];
};
