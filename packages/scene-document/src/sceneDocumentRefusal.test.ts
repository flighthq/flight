import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentFields,
  FlightDocumentNode,
  FlightDocumentNodeSchema,
  FlightDocumentResourceLookup,
  FlightDocumentSchemaRegistry,
  NodeAny,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  checkUnregisteredNodeKinds,
  checkUnregisteredNodeKindsFromRaw,
  createDocumentRefusal,
  createSceneRefusal,
} from './sceneDocumentRefusal';

describe('checkUnregisteredNodeKinds', () => {
  it('returns null when all kinds are registered', () => {
    const schemas = createTestSchemas('TestKind');
    const node: FlightDocumentNode = { children: [], fields: {}, kind: 'TestKind' };
    expect(checkUnregisteredNodeKinds(node, schemas, 0, 'scene')).toBeNull();
  });

  it('returns refusal naming the unregistered kind', () => {
    const schemas = createTestSchemas('TestKind');
    const node: FlightDocumentNode = { children: [], fields: {}, kind: 'acme.Missing' };
    const refusal = checkUnregisteredNodeKinds(node, schemas, 0, 'scene');
    expect(refusal).not.toBeNull();
    expect(refusal!.reason).toBe(FlightDocumentRefusalReason.NodeKindUnregistered);
    expect(refusal!.kind).toBe('acme.Missing');
    expect(refusal!.path).toBe('scenes[0].scene');
  });

  it('walks children and qualifies nested path', () => {
    const schemas = createTestSchemas('TestKind');
    const node: FlightDocumentNode = {
      children: [
        {
          children: [{ children: [], fields: {}, kind: 'acme.Deep' }],
          fields: {},
          kind: 'TestKind',
        },
      ],
      fields: {},
      kind: 'TestKind',
    };
    const refusal = checkUnregisteredNodeKinds(node, schemas, 0, 'scene');
    expect(refusal).not.toBeNull();
    expect(refusal!.path).toBe('scenes[0].scene.children[0].children[0]');
    expect(refusal!.kind).toBe('acme.Deep');
  });
});

describe('checkUnregisteredNodeKindsFromRaw', () => {
  it('returns null for non-object value', () => {
    const schemas = createTestSchemas('TestKind');
    expect(checkUnregisteredNodeKindsFromRaw(null, schemas, 0, 'scene')).toBeNull();
    expect(checkUnregisteredNodeKindsFromRaw(42, schemas, 0, 'scene')).toBeNull();
  });

  it('returns refusal for unregistered kind in raw object', () => {
    const schemas = createTestSchemas('TestKind');
    const raw = { children: [], kind: 'acme.Unknown' };
    const refusal = checkUnregisteredNodeKindsFromRaw(raw, schemas, 0, 'scene');
    expect(refusal).not.toBeNull();
    expect(refusal!.reason).toBe(FlightDocumentRefusalReason.NodeKindUnregistered);
    expect(refusal!.kind).toBe('acme.Unknown');
  });

  it('walks raw children recursively', () => {
    const schemas = createTestSchemas('TestKind');
    const raw = {
      children: [{ children: [], kind: 'acme.Nested' }],
      kind: 'TestKind',
    };
    const refusal = checkUnregisteredNodeKindsFromRaw(raw, schemas, 0, 'scene');
    expect(refusal).not.toBeNull();
    expect(refusal!.path).toBe('scenes[0].scene.children[0]');
    expect(refusal!.kind).toBe('acme.Nested');
  });
});

describe('createDocumentRefusal', () => {
  it('produces a refusal with the given path', () => {
    const refusal = createDocumentRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version');
    expect(refusal.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(refusal.path).toBe('version');
  });

  it('nulls all optional fields', () => {
    const refusal = createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, '');
    expect(refusal.actual).toBeNull();
    expect(refusal.column).toBeNull();
    expect(refusal.kind).toBeNull();
    expect(refusal.limit).toBeNull();
    expect(refusal.line).toBeNull();
    expect(refusal.offset).toBeNull();
    expect(refusal.resourceKey).toBeNull();
    expect(refusal.version).toBeNull();
  });
});

describe('createSceneRefusal', () => {
  it('qualifies path with scene index', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.DuplicateAmbientLight, 0, 'lights');
    expect(refusal.path).toBe('scenes[0].lights');
  });

  it('qualifies with non-zero scene index', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.DuplicateDirectionalLight, 2, 'lights');
    expect(refusal.path).toBe('scenes[2].lights');
  });

  it('omits trailing dot for empty inner path', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, 1, '');
    expect(refusal.path).toBe('scenes[1]');
  });

  it('carries the reason through', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, 0, 'kind');
    expect(refusal.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(refusal.path).toBe('scenes[0].kind');
  });
});

function createTestSchemas(registeredKind: string): FlightDocumentSchemaRegistry {
  const schema: FlightDocumentNodeSchema = {
    createNode: (_fields: Readonly<FlightDocumentFields>, _resources: FlightDocumentResourceLookup) => null,
    fields: [],
    kind: registeredKind,
    writeNodeFields: (_out: FlightDocumentFields, _source: Readonly<NodeAny>) => true,
  };
  let nodeSchemas = createKeyedTable<FlightDocumentNodeSchema>('flight-document.node', 'none');
  nodeSchemas = withRegistryTableEntry(nodeSchemas, registeredKind, schema);
  return {
    nodeSchemas,
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}
