import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  FlightDocumentInteractiveStateBinding,
  FlightDocumentNode,
  FlightDocumentSchemaRegistry,
  NodeAny,
} from '@flighthq/types/contract';

import {
  assertAllInteractiveStateBindingsUsed,
  createInteractiveStateBindingLookup,
  isInteractiveStateBindingTargetSupported,
  readInteractiveStateBindingMetadata,
} from './sceneDocumentInteractiveStateBindings';

describe('assertAllInteractiveStateBindingsUsed', () => {
  it('rejects a lookup containing a foreign scene node', () => {
    const node = createDisplayObject();
    const lookup = createInteractiveStateBindingLookup([createBinding(node)]);

    expect(() => assertAllInteractiveStateBindingsUsed(lookup, new Set())).toThrow(RangeError);
    expect(() => assertAllInteractiveStateBindingsUsed(lookup, new Set([node]))).not.toThrow();
  });
});

describe('createInteractiveStateBindingLookup', () => {
  it('indexes by exact node identity and rejects duplicates', () => {
    const node = createDisplayObject();
    const binding = createBinding(node);
    const lookup = createInteractiveStateBindingLookup([binding]);

    expect(lookup.get(node)).toBe(binding);
    expect(() => createInteractiveStateBindingLookup([binding, binding])).toThrow(RangeError);
  });
});

describe('isInteractiveStateBindingTargetSupported', () => {
  it('delegates target support to every referenced registered extension', () => {
    const node = createDisplayObject();
    const documentNode: FlightDocumentNode = {
      children: [],
      fields: {},
      interactiveStates: {
        disabled: null,
        hover: { extensions: [{ fields: {}, kind: 'acme.Outline' }] },
        pressed: null,
      },
      kind: node.kind,
      transition: null,
    };
    const schemas = createSchemas();
    schemas.interactiveStateExtensionSchemas = withRegistryTableEntry(
      schemas.interactiveStateExtensionSchemas,
      'acme.Outline',
      {
        createExtension: () => null,
        fields: [],
        isSupported: () => false,
        kind: 'acme.Outline',
      },
    );

    expect(isInteractiveStateBindingTargetSupported(node, documentNode, schemas)).toBe(false);
  });
});

describe('readInteractiveStateBindingMetadata', () => {
  it('clones descriptors and elides registered default fields', () => {
    const node = createDisplayObject();
    const binding = createBinding(node);
    binding.interactiveStates.hover!.extensions.push({ fields: { width: 1 }, kind: 'acme.Outline' });
    binding.transition = { fields: { duration: 100 }, kind: 'acme.Transition' };
    const schemas = createSchemas();
    schemas.interactiveStateExtensionSchemas = withRegistryTableEntry(
      schemas.interactiveStateExtensionSchemas,
      'acme.Outline',
      {
        createExtension: () => null,
        fields: [{ defaultValue: 1, name: 'width', required: false, validate: () => true }],
        isSupported: () => true,
        kind: 'acme.Outline',
      },
    );
    schemas.interactiveStateTransitionSchemas = withRegistryTableEntry(
      schemas.interactiveStateTransitionSchemas,
      'acme.Transition',
      {
        createTransition: () => null,
        fields: [{ defaultValue: 100, name: 'duration', required: false, validate: () => true }],
        kind: 'acme.Transition',
      },
    );
    const used = new Set<Readonly<NodeAny>>();
    const metadata = readInteractiveStateBindingMetadata(
      node,
      createInteractiveStateBindingLookup([binding]),
      used,
      schemas,
    );

    expect(metadata.interactiveStates?.hover?.extensions[0]?.fields).toEqual({});
    expect(metadata.transition?.fields).toEqual({});
    expect(metadata.interactiveStates).not.toBe(binding.interactiveStates);
    expect(used.has(node)).toBe(true);
  });
});

function createBinding(node: ReturnType<typeof createDisplayObject>): FlightDocumentInteractiveStateBinding {
  return {
    interactiveStates: {
      disabled: null,
      hover: { alpha: 0.8, extensions: [] },
      pressed: null,
    },
    node,
    transition: null,
  };
}

function createSchemas(): FlightDocumentSchemaRegistry {
  return {
    interactiveStateExtensionSchemas: createKeyedTable('flight-document.interactive-state-extension', 'none'),
    interactiveStateTransitionSchemas: createKeyedTable('flight-document.interactive-state-transition', 'none'),
    nodeSchemas: createKeyedTable('flight-document.node', 'none'),
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}
