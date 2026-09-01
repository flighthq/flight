import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocument,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceSchema,
  FlightDocumentSchemaRegistry,
} from '@flighthq/types/contract';
import { DisplayObjectKind } from '@flighthq/types/contract';

import { getFlightDocumentResourceDependencies } from './flightDocumentResourceDependencies';

describe('getFlightDocumentResourceDependencies', () => {
  it('returns every directly declared resource in document order', () => {
    const texture = createResource('hero', 'Texture', { source: 'hero.png' });
    const mesh = createResource('terrain', 'Mesh', { source: 'terrain.glb' });
    const document = createDocument([texture, mesh]);

    expect(getFlightDocumentResourceDependencies(document, createSchemas('Mesh', 'Texture'))).toEqual([texture, mesh]);
  });

  it('returns an empty list when the document declares no resources', () => {
    expect(getFlightDocumentResourceDependencies(createDocument([]), createSchemas())).toEqual([]);
  });

  it('returns null when a declared resource kind is not registered', () => {
    const document = createDocument([
      createResource('hero', 'Texture', { source: 'hero.png' }),
      createResource('terrain', 'acme.Mesh', { source: 'terrain.mesh' }),
    ]);

    expect(getFlightDocumentResourceDependencies(document, createSchemas('Texture'))).toBeNull();
  });

  it('does not infer dependencies by traversing resource fields or scene nodes', () => {
    const texture = createResource('hero', 'Texture', {
      nestedResourceKey: 'undeclared-resource',
      source: 'hero.png',
    });
    const document = createDocument([texture]);
    document.scenes[0].scene.fields['texture'] = 'hero';

    expect(getFlightDocumentResourceDependencies(document, createSchemas('Texture'))).toEqual([texture]);
  });
});

function createDocument(resources: FlightDocumentResourceDescriptor[]): FlightDocument {
  return {
    defaultScene: 0,
    resources,
    scenes: [
      {
        backgroundColor: null,
        kind: 'Scene2D',
        scene: { children: [], fields: {}, kind: DisplayObjectKind },
        tokens: [],
      },
    ],
    version: 1,
  };
}

function createResource(
  key: string,
  kind: string,
  fields: FlightDocumentResourceDescriptor['fields'],
): FlightDocumentResourceDescriptor {
  return { fields, key, kind };
}

function createSchemas(...resourceKinds: string[]): FlightDocumentSchemaRegistry {
  let resourceSchemas = createKeyedTable<FlightDocumentResourceSchema>('flight-document.resource', 'none');
  for (const kind of resourceKinds) {
    resourceSchemas = withRegistryTableEntry(resourceSchemas, kind, { fields: [], kind });
  }
  return {
    interactiveStateExtensionSchemas: createKeyedTable('flight-document.interactive-state-extension', 'none'),
    interactiveStateTransitionSchemas: createKeyedTable('flight-document.interactive-state-transition', 'none'),
    nodeSchemas: createKeyedTable('flight-document.node', 'none'),
    resourceSchemas,
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}
