import { invalidateNodeAppearance, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentFields,
  FlightDocumentInteractiveState,
  FlightDocumentInteractiveStates,
  FlightDocumentInteractiveStateTransitionDescriptor,
  FlightDocumentSchemaRegistry,
  NodeAny,
  NodeInteractiveStateBinding,
  NodeInteractiveStateBindingRuntime,
  NodeInteractiveStateExplanation,
  NodeInteractiveStateExtensionRuntime,
  NodeInteractiveStateFlags,
  NodeInteractiveStateProperty,
  NodeInteractiveStateTransition,
  NodeInteractiveStateTransitionValue,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, NodeInteractiveStateRefusalReason } from '@flighthq/types/contract';

interface InteractiveExtension {
  base: FlightDocumentFields;
  kind: string;
  runtime: NodeInteractiveStateExtensionRuntime;
}

interface InteractiveStateRuntime extends NodeInteractiveStateBindingRuntime {
  base: Partial<Record<NodeInteractiveStateProperty, NodeInteractiveStateTransitionValue>>;
  extensions: InteractiveExtension[];
  flags: NodeInteractiveStateFlags;
  node: NodeAny;
  states: Readonly<FlightDocumentInteractiveStates>;
  transition: Readonly<NodeInteractiveStateTransition> | null;
}

interface BuildResult {
  explanation: NodeInteractiveStateExplanation | null;
  runtime: InteractiveStateRuntime | null;
}

export function applyNodeInteractiveStates(
  binding: NodeInteractiveStateBinding,
  flags: Readonly<NodeInteractiveStateFlags>,
): boolean {
  const runtime = getInteractiveStateRuntime(binding);
  if (runtime.disposed) return false;
  if (sameFlags(runtime.flags, flags)) return true;

  const layers = getActiveLayers(runtime.states, flags);
  for (const property of INTERACTIVE_STATE_PROPERTIES) {
    const base = runtime.base[property];
    if (base === undefined) continue;
    let value = base;
    for (const layer of layers) {
      const next = layer[property];
      if (next !== undefined) value = next;
    }
    applyCoreProperty(runtime, property, value);
  }

  for (const extension of runtime.extensions) {
    const fields = { ...extension.base };
    for (const layer of layers) {
      const descriptor = layer.extensions.find((entry) => entry.kind === extension.kind);
      if (descriptor !== undefined) Object.assign(fields, descriptor.fields);
    }
    if (!extension.runtime.apply(fields, runtime.transition)) return false;
  }

  runtime.flags = { ...flags };
  return true;
}

export function createNodeInteractiveStateBinding(
  node: NodeAny,
  interactiveStates: Readonly<FlightDocumentInteractiveStates>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  transition: Readonly<FlightDocumentInteractiveStateTransitionDescriptor> | null = null,
): NodeInteractiveStateBinding | null {
  const result = buildInteractiveStateRuntime(node, interactiveStates, schemas, transition);
  if (result.runtime === null) return null;
  return { [EntityRuntimeKey]: result.runtime } as unknown as NodeInteractiveStateBinding;
}

export function disposeNodeInteractiveStateBinding(binding: NodeInteractiveStateBinding): void {
  const runtime = getInteractiveStateRuntime(binding);
  if (runtime.disposed) return;
  for (const property of INTERACTIVE_STATE_PROPERTIES) {
    const value = runtime.base[property];
    if (value !== undefined) applyCorePropertyImmediately(runtime.node, property, value);
  }
  for (const extension of runtime.extensions) {
    extension.runtime.apply(extension.base, null);
    extension.runtime.dispose();
  }
  runtime.extensions.length = 0;
  runtime.disposed = true;
}

export function explainNodeInteractiveStateBinding(
  node: NodeAny,
  interactiveStates: Readonly<FlightDocumentInteractiveStates>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  transition: Readonly<FlightDocumentInteractiveStateTransitionDescriptor> | null = null,
): NodeInteractiveStateExplanation | null {
  const result = buildInteractiveStateRuntime(node, interactiveStates, schemas, transition);
  if (result.runtime !== null) {
    for (const extension of result.runtime.extensions) extension.runtime.dispose();
  }
  return result.explanation;
}

function applyCoreProperty(
  runtime: InteractiveStateRuntime,
  property: NodeInteractiveStateProperty,
  value: NodeInteractiveStateTransitionValue,
): void {
  const target = runtime.node as unknown as Record<NodeInteractiveStateProperty, unknown>;
  const from = target[property];
  if ((typeof from !== 'boolean' && typeof from !== 'number') || Object.is(from, value)) return;
  const apply = (next: NodeInteractiveStateTransitionValue = value) => {
    if (runtime.disposed || typeof next !== typeof from) return;
    applyCorePropertyImmediately(runtime.node, property, next);
  };
  if (runtime.transition === null) apply();
  else runtime.transition.run({ apply, from, property, target: runtime.node, value });
}

function applyCorePropertyImmediately(
  node: NodeAny,
  property: NodeInteractiveStateProperty,
  value: NodeInteractiveStateTransitionValue,
): void {
  const target = node as unknown as Record<NodeInteractiveStateProperty, NodeInteractiveStateTransitionValue>;
  if (Object.is(target[property], value)) return;
  target[property] = value;
  if (property === 'alpha' || property === 'visible') invalidateNodeAppearance(node);
  else invalidateNodeLocalTransform(node);
}

function buildInteractiveStateRuntime(
  node: NodeAny,
  interactiveStates: Readonly<FlightDocumentInteractiveStates>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  transitionDescriptor: Readonly<FlightDocumentInteractiveStateTransitionDescriptor> | null,
): BuildResult {
  const base: InteractiveStateRuntime['base'] = {};
  for (const property of INTERACTIVE_STATE_PROPERTIES) {
    if (!hasInteractiveStateProperty(interactiveStates, property)) continue;
    const value = (node as unknown as Record<string, unknown>)[property];
    if (typeof value !== 'boolean' && typeof value !== 'number') {
      return {
        explanation: {
          kind: node.kind,
          property,
          reason: NodeInteractiveStateRefusalReason.PropertyTargetUnsupported,
        },
        runtime: null,
      };
    }
    base[property] = value;
  }

  let transition: Readonly<NodeInteractiveStateTransition> | null = null;
  if (transitionDescriptor !== null) {
    const schema = getRegistryTableEntry(schemas.interactiveStateTransitionSchemas, transitionDescriptor.kind);
    if (schema === null) {
      return {
        explanation: {
          kind: transitionDescriptor.kind,
          reason: NodeInteractiveStateRefusalReason.TransitionKindUnregistered,
        },
        runtime: null,
      };
    }
    transition = schema.createTransition(transitionDescriptor.fields);
    if (transition === null) {
      return {
        explanation: {
          kind: transitionDescriptor.kind,
          reason: NodeInteractiveStateRefusalReason.TransitionCreationFailed,
        },
        runtime: null,
      };
    }
  }

  const extensions: InteractiveExtension[] = [];
  for (const [kind, fieldNames] of collectExtensionFieldNames(interactiveStates)) {
    const schema = getRegistryTableEntry(schemas.interactiveStateExtensionSchemas, kind);
    if (schema === null) {
      disposeExtensions(extensions);
      return {
        explanation: { kind, reason: NodeInteractiveStateRefusalReason.ExtensionKindUnregistered },
        runtime: null,
      };
    }
    if (!schema.isSupported(node)) {
      disposeExtensions(extensions);
      return {
        explanation: { kind, reason: NodeInteractiveStateRefusalReason.ExtensionTargetUnsupported },
        runtime: null,
      };
    }
    const extensionRuntime = schema.createExtension(node, fieldNames);
    if (extensionRuntime === null) {
      disposeExtensions(extensions);
      return {
        explanation: { kind, reason: NodeInteractiveStateRefusalReason.ExtensionCreationFailed },
        runtime: null,
      };
    }
    const captured: FlightDocumentFields = {};
    if (!extensionRuntime.capture(captured)) {
      extensionRuntime.dispose();
      disposeExtensions(extensions);
      return {
        explanation: { kind, reason: NodeInteractiveStateRefusalReason.ExtensionCreationFailed },
        runtime: null,
      };
    }
    extensions.push({ base: captured, kind, runtime: extensionRuntime });
  }

  return {
    explanation: null,
    runtime: {
      base,
      binding: null,
      disposed: false,
      extensions,
      flags: { disabled: false, hovered: false, pressed: false },
      node,
      states: interactiveStates,
      transition,
    },
  };
}

function collectExtensionFieldNames(states: Readonly<FlightDocumentInteractiveStates>): Map<string, readonly string[]> {
  const names = new Map<string, string[]>();
  for (const phase of INTERACTIVE_STATE_PHASES) {
    const state = states[phase];
    if (state === null) continue;
    for (const extension of state.extensions) {
      let fieldNames = names.get(extension.kind);
      if (fieldNames === undefined) {
        fieldNames = [];
        names.set(extension.kind, fieldNames);
      }
      for (const name of Object.keys(extension.fields)) {
        if (!fieldNames.includes(name)) fieldNames.push(name);
      }
    }
  }
  return names;
}

function disposeExtensions(extensions: readonly InteractiveExtension[]): void {
  for (const extension of extensions) extension.runtime.dispose();
}

function getActiveLayers(
  states: Readonly<FlightDocumentInteractiveStates>,
  flags: Readonly<NodeInteractiveStateFlags>,
): readonly Readonly<FlightDocumentInteractiveState>[] {
  if (flags.disabled) return states.disabled === null ? [] : [states.disabled];
  const out: Readonly<FlightDocumentInteractiveState>[] = [];
  if (flags.hovered && states.hover !== null) out.push(states.hover);
  if (flags.pressed && states.pressed !== null) out.push(states.pressed);
  return out;
}

function getInteractiveStateRuntime(binding: NodeInteractiveStateBinding): InteractiveStateRuntime {
  return binding[EntityRuntimeKey] as InteractiveStateRuntime;
}

function hasInteractiveStateProperty(
  states: Readonly<FlightDocumentInteractiveStates>,
  property: NodeInteractiveStateProperty,
): boolean {
  for (const phase of INTERACTIVE_STATE_PHASES) {
    if (states[phase]?.[property] !== undefined) return true;
  }
  return false;
}

function sameFlags(left: Readonly<NodeInteractiveStateFlags>, right: Readonly<NodeInteractiveStateFlags>): boolean {
  return left.disabled === right.disabled && left.hovered === right.hovered && left.pressed === right.pressed;
}

const INTERACTIVE_STATE_PHASES = ['disabled', 'hover', 'pressed'] as const;
const INTERACTIVE_STATE_PROPERTIES = ['alpha', 'scaleX', 'scaleY', 'visible', 'x', 'y'] as const;
