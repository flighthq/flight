import type { ImportDiagnostic, RiveCoreObject } from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { createRiveStateMachines } from './riveStateMachine';

// The charter puts Rive's state-machine RUNTIME in a separate cell, so this reports the machine and
// interprets none of it. References keep the values the file states: Rive uses several distinct id
// spaces, and a descriptor that guessed at one would be worse than a faithful report.

const STATE_MACHINE = 53;
const NUMBER_INPUT = 56;
const LAYER = 57;
const TRIGGER_INPUT = 58;
const BOOL_INPUT = 59;
const ANIMATION_STATE = 61;
const ANY_STATE = 62;
const ENTRY_STATE = 63;
const TRANSITION = 65;
const SHAPE = 3;

const NAME = 138;
const ANIMATION_NAME = 55;
const NUMBER_VALUE = 140;
const BOOL_VALUE = 141;
const ANIMATION_ID = 149;
const STATE_TO_ID = 151;
const FLAGS = 152;
const DURATION = 158;
const EXIT_TIME = 160;

describe('createRiveStateMachines', () => {
  it('returns nothing when the range holds no state machine', () => {
    expect(createRiveStateMachines([object(SHAPE, {})], { end: 1, start: 0 })).toEqual([]);
  });

  it('takes a machine name from the Animation key, not the component key', () => {
    // Reading the machine with the layer's name key leaves every machine unnamed, which is what the
    // corpus showed before this was corrected.
    const wrongKey = run([{ properties: [prop(NAME, 'ignored')], typeKey: STATE_MACHINE }]);

    expect(wrongKey[0].name).toBe('');
    expect(run([text(STATE_MACHINE, 'idle')])[0].name).toBe('idle');
  });

  it('names each machine and keeps them in file order', () => {
    const machines = run([text(STATE_MACHINE, 'idle'), text(STATE_MACHINE, 'walk')]);

    expect(machines.map((machine) => machine.name)).toEqual(['idle', 'walk']);
  });

  it('reads each input kind with the value it carries, and none for a trigger', () => {
    const machines = run([
      text(STATE_MACHINE, 'sm'),
      { properties: [prop(NAME, 'speed'), num(NUMBER_VALUE, 2.5)], typeKey: NUMBER_INPUT },
      { properties: [prop(NAME, 'on'), num(BOOL_VALUE, 1)], typeKey: BOOL_INPUT },
      { properties: [prop(NAME, 'fire')], typeKey: TRIGGER_INPUT },
    ]);

    expect(machines[0].inputs).toEqual([
      { kind: 'StateMachineNumber', name: 'speed', value: 2.5 },
      { kind: 'StateMachineBool', name: 'on', value: true },
      { kind: 'StateMachineTrigger', name: 'fire', value: null },
    ]);
  });

  it('nests states under the layer that declares them', () => {
    const machines = run([
      text(STATE_MACHINE, 'sm'),
      text(LAYER, 'base'),
      object(ENTRY_STATE, {}),
      object(ANIMATION_STATE, { [ANIMATION_ID]: 3 }),
      text(LAYER, 'overlay'),
      object(ANY_STATE, {}),
    ]);

    expect(machines[0].layers.map((layer) => layer.name)).toEqual(['base', 'overlay']);
    expect(machines[0].layers[0].states.map((state) => state.kind)).toEqual(['EntryState', 'AnimationState']);
    expect(machines[0].layers[1].states.map((state) => state.kind)).toEqual(['AnyState']);
  });

  it('reports the animation a state plays, and -1 for a state that plays none', () => {
    const machines = run([
      text(STATE_MACHINE, 'sm'),
      text(LAYER, 'base'),
      object(ANIMATION_STATE, { [ANIMATION_ID]: 7 }),
      object(ENTRY_STATE, {}),
    ]);

    expect(machines[0].layers[0].states.map((state) => state.animationId)).toEqual([7, -1]);
  });

  it('attaches transitions to the state they leave', () => {
    const machines = run([
      text(STATE_MACHINE, 'sm'),
      text(LAYER, 'base'),
      object(ANIMATION_STATE, {}),
      object(TRANSITION, { [STATE_TO_ID]: 4, [DURATION]: 120, [EXIT_TIME]: 30, [FLAGS]: 3 }),
      object(ANIMATION_STATE, {}),
      object(TRANSITION, { [STATE_TO_ID]: 2 }),
    ]);
    const states = machines[0].layers[0].states;

    expect(states[0].transitions).toEqual([{ duration: 120, exitTime: 30, flags: 3, toStateId: 4 }]);
    expect(states[1].transitions).toEqual([{ duration: 0, exitTime: 0, flags: 0, toStateId: 2 }]);
  });

  it('starts a fresh machine rather than folding layers into the previous one', () => {
    const machines = run([
      text(STATE_MACHINE, 'first'),
      text(LAYER, 'a'),
      object(ANY_STATE, {}),
      text(STATE_MACHINE, 'second'),
      text(LAYER, 'b'),
    ]);

    expect(machines[0].layers).toHaveLength(1);
    expect(machines[1].layers.map((layer) => layer.name)).toEqual(['b']);
    expect(machines[1].layers[0].states).toEqual([]);
  });

  it('reports state machine parts that precede any machine', () => {
    const diagnostics: ImportDiagnostic[] = [];

    expect(run([text(LAYER, 'orphan'), object(ANY_STATE, {})], diagnostics)).toEqual([]);
    expect(diagnostics.map((entry) => entry.kind)).toEqual([
      'rive.state-machine-part-unowned',
      'rive.state-machine-part-unowned',
    ]);
  });

  it('stays silent for ordinary artboard content preceding a machine', () => {
    const diagnostics: ImportDiagnostic[] = [];
    // Everything before the first machine is skipped, and almost all of it is ordinary content. Only a
    // state-machine PART reaching that skip is a loss, so a shape ahead of a machine must stay quiet.
    const machines = run([object(SHAPE, {}), object(STATE_MACHINE, {}), text(LAYER, 'main')], diagnostics);

    expect(machines).toHaveLength(1);
    expect(diagnostics).toEqual([]);
  });
});

function run(objects: RiveCoreObject[], diagnostics?: ImportDiagnostic[]) {
  return createRiveStateMachines(objects, { end: objects.length, start: 0 }, diagnostics);
}

function prop(key: number, value: string) {
  return { key, type: RiveFieldType.String, value };
}

function num(key: number, value: number) {
  return { key, type: RiveFieldType.Double, value };
}

// A machine takes its name from the Animation it extends; a layer takes the state-machine component's.
function text(typeKey: number, name: string): RiveCoreObject {
  return { properties: [prop(typeKey === STATE_MACHINE ? ANIMATION_NAME : NAME, name)], typeKey };
}

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => num(Number(key), value)),
    typeKey,
  };
}
