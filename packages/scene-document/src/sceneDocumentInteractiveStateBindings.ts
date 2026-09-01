import { getRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentFields,
  FlightDocumentInteractiveState,
  FlightDocumentInteractiveStateBinding,
  FlightDocumentInteractiveStates,
  FlightDocumentInteractiveStateTransitionDescriptor,
  FlightDocumentNode,
  FlightDocumentSchemaRegistry,
  FlightDocumentValue,
  NodeAny,
} from '@flighthq/types/contract';

interface FlightDocumentInteractiveStateMetadata {
  interactiveStates: FlightDocumentInteractiveStates | null;
  transition: FlightDocumentInteractiveStateTransitionDescriptor | null;
}

export function assertAllInteractiveStateBindingsUsed(
  bindings: ReadonlyMap<Readonly<NodeAny>, unknown>,
  usedBindings: ReadonlySet<Readonly<NodeAny>>,
): void {
  if (bindings.size !== usedBindings.size) {
    throw new RangeError('FlightDocument interactive-state binding references a node outside the written scene');
  }
}

export function createInteractiveStateBindingLookup<N extends NodeAny>(
  bindings: readonly Readonly<FlightDocumentInteractiveStateBinding<N>>[],
): ReadonlyMap<Readonly<NodeAny>, Readonly<FlightDocumentInteractiveStateBinding<N>>> {
  const out = new Map<Readonly<NodeAny>, Readonly<FlightDocumentInteractiveStateBinding<N>>>();
  for (const binding of bindings) {
    if (out.has(binding.node)) throw new RangeError('Duplicate FlightDocument interactive-state node binding');
    out.set(binding.node, binding);
  }
  return out;
}

export function isInteractiveStateBindingTargetSupported(
  node: Readonly<NodeAny>,
  documentNode: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): boolean {
  if (documentNode.interactiveStates == null) return true;
  for (const state of [
    documentNode.interactiveStates.disabled,
    documentNode.interactiveStates.hover,
    documentNode.interactiveStates.pressed,
  ]) {
    if (state === null) continue;
    for (const extension of state.extensions) {
      const schema = getRegistryTableEntry(schemas.interactiveStateExtensionSchemas, extension.kind);
      if (schema === null || !schema.isSupported(node)) return false;
    }
  }
  return true;
}

export function readInteractiveStateBindingMetadata(
  node: Readonly<NodeAny>,
  bindings: ReadonlyMap<Readonly<NodeAny>, Readonly<FlightDocumentInteractiveStateBinding>>,
  usedBindings: Set<Readonly<NodeAny>>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): FlightDocumentInteractiveStateMetadata {
  const binding = bindings.get(node);
  if (binding === undefined) return { interactiveStates: null, transition: null };
  usedBindings.add(node);
  const interactiveStates = cloneInteractiveStates(binding.interactiveStates);
  for (const state of [interactiveStates.disabled, interactiveStates.hover, interactiveStates.pressed]) {
    if (state === null) continue;
    for (const extension of state.extensions) {
      const schema = getRegistryTableEntry(schemas.interactiveStateExtensionSchemas, extension.kind);
      if (schema !== null) elideDefaultFields(extension.fields, schema.fields);
    }
  }
  const transition = binding.transition === null ? null : cloneTransition(binding.transition);
  if (transition !== null) {
    const schema = getRegistryTableEntry(schemas.interactiveStateTransitionSchemas, transition.kind);
    if (schema !== null) elideDefaultFields(transition.fields, schema.fields);
  }
  return { interactiveStates, transition };
}

function cloneInteractiveState(state: Readonly<FlightDocumentInteractiveState>): FlightDocumentInteractiveState {
  const out: FlightDocumentInteractiveState = {
    extensions: state.extensions.map((extension) => ({
      fields: cloneFields(extension.fields),
      kind: extension.kind,
    })),
  };
  if (state.alpha !== undefined) out.alpha = state.alpha;
  if (state.scaleX !== undefined) out.scaleX = state.scaleX;
  if (state.scaleY !== undefined) out.scaleY = state.scaleY;
  if (state.visible !== undefined) out.visible = state.visible;
  if (state.x !== undefined) out.x = state.x;
  if (state.y !== undefined) out.y = state.y;
  return out;
}

function cloneInteractiveStates(states: Readonly<FlightDocumentInteractiveStates>): FlightDocumentInteractiveStates {
  return {
    disabled: states.disabled === null ? null : cloneInteractiveState(states.disabled),
    hover: states.hover === null ? null : cloneInteractiveState(states.hover),
    pressed: states.pressed === null ? null : cloneInteractiveState(states.pressed),
  };
}

function cloneTransition(
  transition: Readonly<FlightDocumentInteractiveStateTransitionDescriptor>,
): FlightDocumentInteractiveStateTransitionDescriptor {
  return { fields: cloneFields(transition.fields), kind: transition.kind };
}

function cloneFields(fields: Readonly<FlightDocumentFields>): FlightDocumentFields {
  const out: FlightDocumentFields = {};
  for (const [name, value] of Object.entries(fields)) out[name] = cloneValue(value);
  return out;
}

function elideDefaultFields(
  fields: FlightDocumentFields,
  fieldSchemas: readonly Readonly<{ defaultValue?: FlightDocumentValue; name: string }>[],
): void {
  for (const fieldSchema of fieldSchemas) {
    if (fieldSchema.defaultValue !== undefined && fields[fieldSchema.name] === fieldSchema.defaultValue) {
      delete fields[fieldSchema.name];
    }
  }
}

function cloneValue(value: FlightDocumentValue): FlightDocumentValue {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  return cloneFields(value);
}
