import { createEntity } from '@flighthq/entity/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentFields,
  FlightDocumentFieldSchema,
  FlightDocumentInteractiveState,
  FlightDocumentNode,
  FlightDocumentRefusalExplanation,
  FlightDocumentRefusalReason as FlightDocumentRefusalReasonType,
  FlightDocumentSchemaRegistry,
  NodeAny,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

export function checkFlightDocumentFields(
  fields: Readonly<FlightDocumentFields>,
  fieldSchemas: readonly Readonly<FlightDocumentFieldSchema>[],
  sceneIndex: number,
  fieldsPath: string,
): FlightDocumentRefusalExplanation | null {
  for (const fieldSchema of fieldSchemas) {
    const hasValue = Object.prototype.hasOwnProperty.call(fields, fieldSchema.name);
    if (!hasValue) {
      if (fieldSchema.required && fieldSchema.defaultValue === undefined) {
        return createSceneRefusal(
          FlightDocumentRefusalReason.FieldInvalid,
          sceneIndex,
          appendFieldPath(fieldsPath, fieldSchema.name),
        );
      }
      continue;
    }
    if (!fieldSchema.validate(fields[fieldSchema.name])) {
      return createSceneRefusal(
        FlightDocumentRefusalReason.FieldInvalid,
        sceneIndex,
        appendFieldPath(fieldsPath, fieldSchema.name),
      );
    }
  }

  for (const name of Object.keys(fields)) {
    if (fieldSchemas.some((fieldSchema) => fieldSchema.name === name)) continue;
    return createSceneRefusal(FlightDocumentRefusalReason.FieldInvalid, sceneIndex, appendFieldPath(fieldsPath, name));
  }
  return null;
}

export function checkFlightDocumentInteractiveStates(
  node: Readonly<FlightDocumentNode>,
  dimension: 'Scene2D' | 'Scene3D',
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
  nodePath: string,
): FlightDocumentRefusalExplanation | null {
  const states = node.interactiveStates ?? null;
  if (states === null) {
    if (node.transition != null) {
      return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, `${nodePath}.transition`);
    }
  } else {
    for (const phase of Object.keys(states)) {
      if (!INTERACTIVE_STATE_PHASES.includes(phase as (typeof INTERACTIVE_STATE_PHASES)[number])) {
        return createSceneRefusal(
          FlightDocumentRefusalReason.StructureInvalid,
          sceneIndex,
          `${nodePath}.interactiveStates.${phase}`,
        );
      }
    }
    let phaseCount = 0;
    for (const phase of INTERACTIVE_STATE_PHASES) {
      const state = states[phase];
      if (state === null) continue;
      phaseCount++;
      const refusal = checkInteractiveState(
        node,
        state,
        dimension,
        schemas,
        sceneIndex,
        `${nodePath}.interactiveStates.${phase}`,
      );
      if (refusal !== null) return refusal;
    }
    if (phaseCount === 0) {
      return createSceneRefusal(
        FlightDocumentRefusalReason.StructureInvalid,
        sceneIndex,
        `${nodePath}.interactiveStates`,
      );
    }
    if (node.transition != null) {
      const transitionSchema = getRegistryTableEntry(schemas.interactiveStateTransitionSchemas, node.transition.kind);
      if (transitionSchema === null) {
        return createKindRefusal(
          FlightDocumentRefusalReason.InteractiveStateTransitionKindUnregistered,
          sceneIndex,
          `${nodePath}.transition`,
          node.transition.kind,
        );
      }
      const transitionRefusal = checkFlightDocumentFields(
        node.transition.fields,
        transitionSchema.fields,
        sceneIndex,
        `${nodePath}.transition`,
      );
      if (transitionRefusal !== null) return transitionRefusal;
    }
  }
  for (let i = 0; i < node.children.length; i++) {
    const childRefusal = checkFlightDocumentInteractiveStates(
      node.children[i],
      dimension,
      schemas,
      sceneIndex,
      `${nodePath}.children[${i}]`,
    );
    if (childRefusal !== null) return childRefusal;
  }
  return null;
}

export function checkFlightDocumentNodeFields(
  node: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
  nodePath: string,
): FlightDocumentRefusalExplanation | null {
  const schema = getRegistryTableEntry(schemas.nodeSchemas, node.kind);
  if (schema === null) return null;
  const fieldRefusal = checkFlightDocumentFields(node.fields, schema.fields, sceneIndex, nodePath);
  if (fieldRefusal !== null) return fieldRefusal;
  for (let i = 0; i < node.children.length; i++) {
    const childPath = `${nodePath}.children[${i}]`;
    const childRefusal = checkFlightDocumentNodeFields(node.children[i], schemas, sceneIndex, childPath);
    if (childRefusal !== null) return childRefusal;
  }
  return null;
}

function checkInteractiveState(
  documentNode: Readonly<FlightDocumentNode>,
  state: Readonly<FlightDocumentInteractiveState>,
  dimension: 'Scene2D' | 'Scene3D',
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
  statePath: string,
): FlightDocumentRefusalExplanation | null {
  const stateValue = state as unknown as Readonly<Record<string, unknown>>;
  for (const name of Object.keys(stateValue)) {
    if (!INTERACTIVE_STATE_KEYS.includes(name)) {
      return createSceneRefusal(FlightDocumentRefusalReason.FieldInvalid, sceneIndex, `${statePath}.${name}`);
    }
  }
  if (!Array.isArray(state.extensions)) {
    return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, `${statePath}.extensions`);
  }
  let fieldCount = 0;
  for (const property of INTERACTIVE_STATE_PROPERTIES) {
    const value = state[property];
    if (value === undefined) continue;
    fieldCount++;
    if (
      (property === 'visible' && typeof value !== 'boolean') ||
      (property !== 'visible' && (typeof value !== 'number' || !Number.isFinite(value))) ||
      (dimension === 'Scene3D' && INTERACTIVE_STATE_2D_PROPERTIES.includes(property))
    ) {
      return createSceneRefusal(FlightDocumentRefusalReason.FieldInvalid, sceneIndex, `${statePath}.${property}`);
    }
  }
  if (fieldCount === 0 && state.extensions.length === 0) {
    return createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, sceneIndex, statePath);
  }

  const kinds = new Set<string>();
  for (let i = 0; i < state.extensions.length; i++) {
    const extension = state.extensions[i];
    const extensionPath = `${statePath}.extensions[${i}]`;
    if (kinds.has(extension.kind)) {
      return createKindRefusal(
        FlightDocumentRefusalReason.InteractiveStateExtensionKindDuplicate,
        sceneIndex,
        extensionPath,
        extension.kind,
      );
    }
    kinds.add(extension.kind);
    const schema = getRegistryTableEntry(schemas.interactiveStateExtensionSchemas, extension.kind);
    if (schema === null) {
      return createKindRefusal(
        FlightDocumentRefusalReason.InteractiveStateExtensionKindUnregistered,
        sceneIndex,
        extensionPath,
        extension.kind,
      );
    }
    const fieldsRefusal = checkFlightDocumentFields(extension.fields, schema.fields, sceneIndex, extensionPath);
    if (fieldsRefusal !== null) return fieldsRefusal;
    const nodeSchema = getRegistryTableEntry(schemas.nodeSchemas, documentNode.kind);
    const probe = nodeSchema?.createNode(documentNode.fields, {}) ?? null;
    if (probe !== null && !schema.isSupported(probe as NodeAny)) {
      return createKindRefusal(
        FlightDocumentRefusalReason.InteractiveStateTargetUnsupported,
        sceneIndex,
        extensionPath,
        extension.kind,
      );
    }
  }
  return null;
}

export function checkUnregisteredNodeKinds(
  node: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
  nodePath: string,
): FlightDocumentRefusalExplanation | null {
  const schema = getRegistryTableEntry(schemas.nodeSchemas, node.kind);
  if (schema === null) {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.NodeKindUnregistered, sceneIndex, nodePath);
    refusal.kind = node.kind;
    return refusal;
  }
  for (let i = 0; i < node.children.length; i++) {
    const childPath = `${nodePath}.children[${i}]`;
    const childRefusal = checkUnregisteredNodeKinds(node.children[i], schemas, sceneIndex, childPath);
    if (childRefusal !== null) return childRefusal;
  }
  return null;
}

export function checkUnregisteredNodeKindsFromRaw(
  value: unknown,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
  nodePath: string,
): FlightDocumentRefusalExplanation | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const mapping = value as Record<string, unknown>;
  const kind = mapping['kind'];
  if (typeof kind !== 'string') return null;
  const schema = getRegistryTableEntry(schemas.nodeSchemas, kind);
  if (schema === null) {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.NodeKindUnregistered, sceneIndex, nodePath);
    refusal.kind = kind;
    return refusal;
  }
  const childrenRaw = mapping['children'];
  if (Array.isArray(childrenRaw)) {
    for (let i = 0; i < childrenRaw.length; i++) {
      const childPath = `${nodePath}.children[${i}]`;
      const childRefusal = checkUnregisteredNodeKindsFromRaw(childrenRaw[i], schemas, sceneIndex, childPath);
      if (childRefusal !== null) return childRefusal;
    }
  }
  return null;
}

export function createDocumentRefusal(
  reason: FlightDocumentRefusalReasonType,
  path: string,
): FlightDocumentRefusalExplanation {
  return createEntity({
    actual: null,
    column: null,
    kind: null,
    limit: null,
    line: null,
    mode: null,
    offset: null,
    path,
    reason,
    resourceKey: null,
    tokenKey: null,
    version: null,
  });
}

export function createSceneRefusal(
  reason: FlightDocumentRefusalReasonType,
  sceneIndex: number,
  innerPath: string,
): FlightDocumentRefusalExplanation {
  const path = innerPath === '' ? `scenes[${sceneIndex}]` : `scenes[${sceneIndex}].${innerPath}`;
  return createDocumentRefusal(reason, path);
}

function createKindRefusal(
  reason: FlightDocumentRefusalReasonType,
  sceneIndex: number,
  innerPath: string,
  kind: string,
): FlightDocumentRefusalExplanation {
  const refusal = createSceneRefusal(reason, sceneIndex, innerPath);
  refusal.kind = kind;
  return refusal;
}

function appendFieldPath(path: string, field: string): string {
  return path === '' ? field : `${path}.${field}`;
}

const INTERACTIVE_STATE_2D_PROPERTIES = ['scaleX', 'scaleY', 'x', 'y'];
const INTERACTIVE_STATE_KEYS = ['alpha', 'extensions', 'scaleX', 'scaleY', 'visible', 'x', 'y'];
const INTERACTIVE_STATE_PHASES = ['disabled', 'hover', 'pressed'] as const;
const INTERACTIVE_STATE_PROPERTIES = ['alpha', 'scaleX', 'scaleY', 'visible', 'x', 'y'] as const;
