import { createTransform3D } from '@flighthq/geometry/contract';
import { createAmbientLight } from '@flighthq/lighting/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { createNode3D } from '@flighthq/scene3d/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNodeSchema,
  FlightDocumentResourceLookup,
  FlightDocumentResourceResolver,
  FlightDocumentResourceResolverRegistry,
  FlightDocumentSchemaRegistry,
  NodeAny,
} from '@flighthq/types/contract';
import { DisplayObjectKind, FlightDocumentRefusalReason, Node3DKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { formatFlightDocumentText } from './flightDocumentText';
import {
  createFlightDocumentScene2DMaterialization,
  createFlightDocumentScene2DMaterializationFromText,
  explainFlightDocumentRefusal,
  explainFlightDocumentRefusalFromText,
} from './sceneDocumentScene2DMaterialization';
import {
  createFlightDocumentScene3DMaterialization,
  createFlightDocumentScene3DMaterializationFromText,
  explainFlightDocumentScene3DRefusal,
} from './sceneDocumentScene3DMaterialization';

const TestScene2DNodeKind = 'TestScene2DNode';
const TestScene3DNodeKind = 'TestScene3DNode';

describe('multi-scene materialization selection', () => {
  it('uses defaultScene by default and can materialize another entry by index', () => {
    const seenResources: unknown[] = [];
    const schemas = createTestSchemas(seenResources);
    const sharedResource = {};
    const resolvers = createTestResolvers(sharedResource);
    const document = createMixedDocument();

    const selected3D = createFlightDocumentScene3DMaterialization(document, schemas, resolvers);
    const selectedAs2D = createFlightDocumentScene2DMaterialization(document, schemas, resolvers);
    const perScene2D = createFlightDocumentScene2DMaterialization(document, schemas, resolvers, 0);
    const wrongPerScene3D = createFlightDocumentScene3DMaterialization(document, schemas, resolvers, 0);

    expect(selected3D).not.toBeNull();
    expect(selectedAs2D).toBeNull();
    expect(perScene2D).not.toBeNull();
    expect(wrongPerScene3D).toBeNull();
    expect(seenResources).toEqual([sharedResource, sharedResource]);
    expect(seenResources[0]).toBe(seenResources[1]);
  });

  it('preserves selected and explicit-index semantics through the text conveniences', () => {
    const seenResources: unknown[] = [];
    const schemas = createTestSchemas(seenResources);
    const sharedResource = {};
    const resolvers = createTestResolvers(sharedResource);
    const text = formatFlightDocumentText(createMixedDocument());

    expect(createFlightDocumentScene3DMaterializationFromText(text, schemas, resolvers)).not.toBeNull();
    expect(createFlightDocumentScene2DMaterializationFromText(text, schemas, resolvers)).toBeNull();
    expect(createFlightDocumentScene2DMaterializationFromText(text, schemas, resolvers, 0)).not.toBeNull();
    expect(explainFlightDocumentRefusalFromText(text, 'Scene2D', schemas, 1)).toMatchObject({
      path: 'scenes[1].kind',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });
    expect(seenResources).toEqual([sharedResource, sharedResource]);
  });

  it('rejects an empty scene container through both dimension entrypoints', () => {
    const document = { defaultScene: 0, resources: [], scenes: [], version: 1 } as unknown as FlightDocument;
    const schemas = createTestSchemas([]);

    expect(createFlightDocumentScene2DMaterialization(document, schemas)).toBeNull();
    expect(createFlightDocumentScene3DMaterialization(document, schemas)).toBeNull();
    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toMatchObject({
      path: 'scenes',
      reason: FlightDocumentRefusalReason.ScenesEmpty,
    });
    expect(explainFlightDocumentScene3DRefusal(document, schemas)).toMatchObject({
      path: 'scenes',
      reason: FlightDocumentRefusalReason.ScenesEmpty,
    });
  });

  it('rejects an invalid defaultScene instead of clamping it even for an explicit scene request', () => {
    const document: FlightDocument = { ...createMixedDocument(), defaultScene: 2 };
    const schemas = createTestSchemas([]);

    expect(createFlightDocumentScene2DMaterialization(document, schemas, undefined, 0)).toBeNull();
    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas, 0)).toMatchObject({
      actual: 2,
      path: 'defaultScene',
      reason: FlightDocumentRefusalReason.DefaultSceneOutOfRange,
    });
  });

  it('qualifies nested and dimension-specific refusals with the requested scene index', () => {
    const document = createMixedDocument();
    const schemas = createTestSchemas([]);

    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas, 1)).toMatchObject({
      path: 'scenes[1].kind',
      reason: FlightDocumentRefusalReason.StructureInvalid,
    });

    const scene = document.scenes[1];
    if (scene.kind !== 'Scene3D') throw new Error('fixture scene 1 must be Scene3D');
    scene.scene.children = [{ children: [], fields: {}, kind: 'acme.Unknown' }];

    expect(explainFlightDocumentScene3DRefusal(document, schemas, 1)).toMatchObject({
      kind: 'acme.Unknown',
      path: 'scenes[1].scene.children[0]',
      reason: FlightDocumentRefusalReason.NodeKindUnregistered,
    });

    scene.scene.children = [];
    scene.lights = [
      { descriptor: createAmbientLight(), transform: createTransform3D() },
      { descriptor: createAmbientLight(), transform: createTransform3D() },
    ];
    expect(explainFlightDocumentScene3DRefusal(document, schemas, 1)).toMatchObject({
      path: 'scenes[1].lights',
      reason: FlightDocumentRefusalReason.DuplicateAmbientLight,
    });
  });
});

function createMixedDocument(): FlightDocument {
  return {
    defaultScene: 1,
    resources: [{ fields: {}, key: 'shared', kind: 'TestResource' }],
    scenes: [
      {
        backgroundColor: null,
        kind: 'Scene2D',
        scene: {
          children: [{ children: [], fields: {}, kind: TestScene2DNodeKind }],
          fields: {},
          kind: DisplayObjectKind,
        },
      },
      {
        cameras: [],
        kind: 'Scene3D',
        lights: [],
        scene: {
          children: [{ children: [], fields: {}, kind: TestScene3DNodeKind }],
          fields: {},
          kind: Node3DKind,
        },
      },
    ],
    version: 1,
  };
}

function createTestResolvers(sharedResource: unknown): FlightDocumentResourceResolverRegistry {
  let resolvers = createKeyedTable<FlightDocumentResourceResolver>('flight-document.resolver', 'none');
  resolvers = withRegistryTableEntry(resolvers, 'TestResource', () => sharedResource);
  return { resolvers };
}

function createTestSchemas(seenResources: unknown[]): FlightDocumentSchemaRegistry {
  const createSchema = (
    kind: string,
    createNode: (resources: FlightDocumentResourceLookup) => NodeAny,
  ): FlightDocumentNodeSchema => ({
    createNode: (_fields, resources) => createNode(resources),
    fields: [],
    kind,
    writeNodeFields: (_out: FlightDocumentFields, _source: Readonly<NodeAny>) => true,
  });
  let nodeSchemas = createKeyedTable<FlightDocumentNodeSchema>('flight-document.node', 'none');
  nodeSchemas = withRegistryTableEntry(
    nodeSchemas,
    DisplayObjectKind,
    createSchema(DisplayObjectKind, () => createDisplayObject()),
  );
  nodeSchemas = withRegistryTableEntry(
    nodeSchemas,
    TestScene2DNodeKind,
    createSchema(TestScene2DNodeKind, (resources) => {
      seenResources.push(resources['shared']);
      return createDisplayObject();
    }),
  );
  nodeSchemas = withRegistryTableEntry(
    nodeSchemas,
    Node3DKind,
    createSchema(Node3DKind, () => createNode3D()),
  );
  nodeSchemas = withRegistryTableEntry(
    nodeSchemas,
    TestScene3DNodeKind,
    createSchema(TestScene3DNodeKind, (resources) => {
      seenResources.push(resources['shared']);
      return createNode3D();
    }),
  );
  return {
    nodeSchemas,
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}
