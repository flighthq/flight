import { getRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentNode,
  FlightDocumentRefusalExplanation,
  FlightDocumentRefusalReason as FlightDocumentRefusalReasonType,
  FlightDocumentSchemaRegistry,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

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
  return {
    actual: null,
    column: null,
    kind: null,
    limit: null,
    line: null,
    offset: null,
    path,
    reason,
    resourceKey: null,
    version: null,
  };
}

export function createSceneRefusal(
  reason: FlightDocumentRefusalReasonType,
  sceneIndex: number,
  innerPath: string,
): FlightDocumentRefusalExplanation {
  const path = innerPath === '' ? `scenes[${sceneIndex}]` : `scenes[${sceneIndex}].${innerPath}`;
  return createDocumentRefusal(reason, path);
}
