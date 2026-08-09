import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ImportDiagnostic,
  RiveCoreObject,
  RiveStateMachineDescriptor,
  RiveStateMachineInput,
  RiveStateMachineLayer,
  RiveStateMachineState,
  RiveStateMachineTransition,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { getRiveCoreTypeName, isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Reads an artboard's state machines as plain data.
 *
 * The charter is explicit that Rive's state-machine *runtime* — inputs driving transitions — is a
 * separate future cell and never a codec concern, so this interprets nothing. It reports the states,
 * the transitions between them, and the inputs by name, and leaves what to do with them to whatever
 * consumes the descriptor.
 *
 * References keep the values the file states rather than being resolved into positions. Rive uses
 * several distinct id spaces — a component's parent, an interpolator, and an asset each index
 * something different — so a descriptor that guessed at a space would be worse than one that reports
 * what is written.
 */
export function createRiveStateMachines(
  objects: readonly Readonly<RiveCoreObject>[],
  range: Readonly<{ end: number; start: number }>,
  diagnostics?: ImportDiagnostic[],
): RiveStateMachineDescriptor[] {
  const machines: RiveStateMachineDescriptor[] = [];
  let layers: RiveStateMachineLayer[] | null = null;
  let states: RiveStateMachineState[] | null = null;
  let transitions: RiveStateMachineTransition[] | null = null;

  for (let index = range.start; index < range.end; index++) {
    const object = objects[index];
    if (object.typeKey === RIVE_STATE_MACHINE) {
      layers = [];
      states = null;
      transitions = null;
      // A machine extends Animation and takes ITS name key; layers and inputs extend the state-machine
      // component and take a different one. Reading the machine with the component's key names nothing.
      machines.push({ inputs: [], layers, name: readRiveText(object, RIVE_ANIMATION_NAME, '') });
      continue;
    }
    if (machines.length === 0) {
      // Everything before the first machine is ordinary artboard content and is skipped in silence.
      // A state-machine PART reaching here is different: a layer, state, transition or input with no
      // machine to own it is dropped, and the machine list still reads as complete without it.
      if (
        isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_STATE_MACHINE_COMPONENT) ||
        isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_STATE_MACHINE_LAYER_COMPONENT)
      ) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'rive.state-machine-part-unowned',
          'createRiveStateMachines',
          { typeKey: object.typeKey },
        );
      }
      continue;
    }
    const machine = machines[machines.length - 1];

    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_STATE_MACHINE_INPUT)) {
      machine.inputs.push(createRiveStateMachineInput(object));
      continue;
    }
    if (object.typeKey === RIVE_STATE_MACHINE_LAYER) {
      states = [];
      transitions = null;
      layers?.push({ name: readRiveText(object, RIVE_SM_NAME, ''), states });
      continue;
    }
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_LAYER_STATE)) {
      transitions = [];
      states?.push({
        // An animation state names the animation it plays; the others carry no animation.
        animationId: readRiveNumber(object, RIVE_STATE_ANIMATION_ID, -1),
        kind: getRiveCoreTypeName(object.typeKey) ?? '',
        transitions,
      });
      continue;
    }
    if (object.typeKey === RIVE_STATE_TRANSITION) {
      transitions?.push({
        duration: readRiveNumber(object, RIVE_TRANSITION_DURATION, 0),
        exitTime: readRiveNumber(object, RIVE_TRANSITION_EXIT_TIME, 0),
        flags: readRiveNumber(object, RIVE_TRANSITION_FLAGS, 0),
        toStateId: readRiveNumber(object, RIVE_TRANSITION_STATE_TO_ID, -1),
      });
    }
  }
  return machines;
}

function createRiveStateMachineInput(source: Readonly<RiveCoreObject>): RiveStateMachineInput {
  // A trigger carries no value; a bool and a number each state one under their own key.
  const bool = isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_STATE_MACHINE_BOOL);
  const number = isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_STATE_MACHINE_NUMBER);
  return {
    kind: getRiveCoreTypeName(source.typeKey) ?? '',
    name: readRiveText(source, RIVE_SM_NAME, ''),
    value: bool
      ? readRiveNumber(source, RIVE_INPUT_BOOL_VALUE, 0) !== 0
      : number
        ? readRiveNumber(source, RIVE_INPUT_NUMBER_VALUE, 0)
        : null,
  };
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveText(source: Readonly<RiveCoreObject>, key: number, fallback: string): string {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'string' ? fallback : property.value;
}

const RIVE_STATE_MACHINE = 53;
const RIVE_STATE_MACHINE_COMPONENT = 54;
const RIVE_STATE_MACHINE_LAYER_COMPONENT = 66;
const RIVE_STATE_MACHINE_INPUT = 55;
const RIVE_STATE_MACHINE_NUMBER = 56;
const RIVE_STATE_MACHINE_LAYER = 57;
const RIVE_STATE_MACHINE_BOOL = 59;
const RIVE_LAYER_STATE = 60;
const RIVE_STATE_TRANSITION = 65;

const RIVE_ANIMATION_NAME = 55;
const RIVE_SM_NAME = 138;
const RIVE_INPUT_NUMBER_VALUE = 140;
const RIVE_INPUT_BOOL_VALUE = 141;
const RIVE_STATE_ANIMATION_ID = 149;
const RIVE_TRANSITION_STATE_TO_ID = 151;
const RIVE_TRANSITION_FLAGS = 152;
const RIVE_TRANSITION_DURATION = 158;
const RIVE_TRANSITION_EXIT_TIME = 160;
