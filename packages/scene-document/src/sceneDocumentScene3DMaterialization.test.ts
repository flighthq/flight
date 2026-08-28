import { createTransform3D } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { getNodeChildren } from '@flighthq/node/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createNode3D, createScene3D } from '@flighthq/scene3d/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNodeSchema,
  FlightDocumentResourceLookup,
  FlightDocumentScene3D,
  FlightDocumentScene3DMaterialization,
  FlightDocumentSchemaRegistry,
  NodeAny,
  Scene3DDocumentCamera,
  Scene3DDocumentLight,
} from '@flighthq/types/contract';
import {
  AmbientLightKind,
  DirectionalLightKind,
  FlightDocumentRefusalReason,
  Node3DKind,
} from '@flighthq/types/contract';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { serializeFlightDocument } from './sceneDocumentScene2DMaterialization';
import {
  createFlightDocumentFromScene3D,
  createFlightDocumentScene3DMaterialization,
  createFlightDocumentScene3DMaterializationFromText,
  explainFlightDocumentScene3DRefusal,
  explainFlightDocumentScene3DRefusalFromText,
} from './sceneDocumentScene3DMaterialization';

describe('createFlightDocumentFromScene3D', () => {
  it('creates a model from an empty Scene3D', () => {
    const scene = createScene3D();
    const document = createFlightDocumentFromScene3D(scene, [], [], createTestSchemas());
    expect(document.kind).toBe('Scene3D');
    expect(document.version).toBe(1);
    expect(document.scene.children).toHaveLength(0);
    expect(document.cameras).toHaveLength(0);
    expect(document.lights).toHaveLength(0);
  });

  it('preserves cameras and lights', () => {
    const scene = createScene3D();
    const cameras: Scene3DDocumentCamera[] = [
      {
        far: 1000,
        name: 'main',
        near: 0.1,
        projection: { aspect: 1.5, fovY: 1.0, kind: 'perspective' },
        transform: createTransform3D(),
      },
    ];
    const lights: Scene3DDocumentLight[] = [
      {
        descriptor: createAmbientLight(),
        name: 'ambient',
        transform: createTransform3D(),
      },
    ];
    const document = createFlightDocumentFromScene3D(scene, cameras, lights, createTestSchemas());
    expect(document.cameras).toHaveLength(1);
    expect(document.cameras[0].far).toBe(1000);
    expect(document.lights).toHaveLength(1);
    expect(document.lights[0].descriptor.kind).toBe(AmbientLightKind);
  });
});

describe('createFlightDocumentScene3DMaterialization', () => {
  it('materializes an empty Scene3D from a minimal model', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    expect(materialization.scene).toBeDefined();
    expect(materialization.cameras).toHaveLength(0);
    expect(materialization.lights).toBeDefined();
  });

  it('materializes cameras from document camera descriptors', () => {
    const document: FlightDocumentScene3D = {
      cameras: [
        {
          far: 500,
          near: 0.5,
          projection: { aspect: 1.77, fovY: 1.047, kind: 'perspective' },
          transform: createTransform3D(),
        },
      ],
      kind: 'Scene3D',
      lights: [],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    expect(materialization.cameras).toHaveLength(1);
    expect(materialization.cameras[0].far).toBe(500);
    expect(materialization.cameras[0].near).toBe(0.5);
    expect(materialization.cameras[0].projection.kind).toBe('perspective');
  });

  it('materializes a tree with children', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      resources: [],
      scene: {
        children: [{ children: [], fields: {}, kind: Node3DKind }],
        fields: {},
        kind: Node3DKind,
      },
      version: 1,
    };
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene3DMaterialization(document, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    const rootChildren = getNodeChildren(materialization.scene.root);
    expect(rootChildren).toHaveLength(1);
    expect(rootChildren[0].kind).toBe(Node3DKind);
  });

  it('returns null for a Scene2D document', () => {
    const document = {
      backgroundColor: null,
      kind: 'Scene2D',
      resources: [],
      scene: { children: [], fields: {}, kind: 'DisplayObject' },
      version: 1,
    } as FlightDocument;
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for an unsupported version', () => {
    const document = {
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 99,
    } as unknown as FlightDocumentScene3D;
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for duplicate ambient lights', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [
        { descriptor: createAmbientLight(), transform: createTransform3D() },
        { descriptor: createAmbientLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for duplicate directional lights', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [
        { descriptor: createDirectionalLight(), transform: createTransform3D() },
        { descriptor: createDirectionalLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });
});

describe('createFlightDocumentScene3DMaterializationFromText', () => {
  it('materializes a Scene3D from YAML text', () => {
    const yaml = ['flight: 1', 'kind: Scene3D', 'scene:', '  kind: Node3D'].join('\n');
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene3DMaterializationFromText(yaml, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    expect(materialization.scene).toBeDefined();
  });

  it('returns null for a Scene2D YAML document', () => {
    const yaml = ['flight: 1', 'kind: Scene2D', 'scene:', '  kind: DisplayObject'].join('\n');
    const result = createFlightDocumentScene3DMaterializationFromText(yaml, createTestSchemas());
    expect(result).toBeNull();
  });
});

describe('duplicate-light explain parity', () => {
  it.each([
    {
      label: 'duplicate ambient',
      document: {
        cameras: [],
        kind: 'Scene3D' as const,
        lights: [
          { descriptor: createAmbientLight(), transform: createTransform3D() },
          { descriptor: createAmbientLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
        ],
        resources: [],
        scene: { children: [], fields: {}, kind: Node3DKind },
        version: 1,
      },
      expectedReason: FlightDocumentRefusalReason.DuplicateAmbientLight,
    },
    {
      label: 'duplicate directional',
      document: {
        cameras: [],
        kind: 'Scene3D' as const,
        lights: [
          { descriptor: createDirectionalLight(), transform: createTransform3D() },
          { descriptor: createDirectionalLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
        ],
        resources: [],
        scene: { children: [], fields: {}, kind: Node3DKind },
        version: 1,
      },
      expectedReason: FlightDocumentRefusalReason.DuplicateDirectionalLight,
    },
  ])('model and text explain agree on $label', ({ document, expectedReason }) => {
    const modelResult = explainFlightDocumentScene3DRefusal(document);
    const text = serializeFlightDocument(document);
    const textResult = explainFlightDocumentScene3DRefusalFromText(text);
    expect(modelResult).not.toBeNull();
    expect(textResult).not.toBeNull();
    expect(textResult!.reason).toBe(modelResult!.reason);
    expect(textResult!.path).toBe(modelResult!.path);
    expect(modelResult!.reason).toBe(expectedReason);
    expect(modelResult!.path).toBe('lights');
  });
});

describe('explainFlightDocumentScene3DRefusal', () => {
  it('explains a dimension mismatch', () => {
    const document = {
      backgroundColor: null,
      kind: 'Scene2D',
      resources: [],
      scene: { children: [], fields: {}, kind: 'DisplayObject' },
      version: 1,
    } as FlightDocument;
    const explanation = explainFlightDocumentScene3DRefusal(document);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('kind');
  });

  it('explains an unsupported version', () => {
    const document = {
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 99,
    } as unknown as FlightDocumentScene3D;
    const explanation = explainFlightDocumentScene3DRefusal(document);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.path).toBe('version');
    expect(explanation!.version).toBe(99);
  });

  it('explains a duplicate ambient light', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [
        { descriptor: createAmbientLight(), transform: createTransform3D() },
        { descriptor: createAmbientLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const explanation = explainFlightDocumentScene3DRefusal(document);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateAmbientLight);
    expect(explanation!.path).toBe('lights');
  });

  it('explains a duplicate directional light', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [
        { descriptor: createDirectionalLight(), transform: createTransform3D() },
        { descriptor: createDirectionalLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const explanation = explainFlightDocumentScene3DRefusal(document);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateDirectionalLight);
    expect(explanation!.path).toBe('lights');
  });

  it('returns null when the document is valid', () => {
    const document: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      resources: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      version: 1,
    };
    const explanation = explainFlightDocumentScene3DRefusal(document);
    expect(explanation).toBeNull();
  });
});

describe('explainFlightDocumentScene3DRefusalFromText', () => {
  it('explains an anchor refusal with parser position', () => {
    const yaml = 'flight: 1\nkind: Scene3D\nanchor: &ref value\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.AnchorUnsupported);
    expect(explanation!.line).toBeGreaterThan(0);
  });

  it('explains a version mismatch in valid YAML', () => {
    const yaml = 'flight: 99\nkind: Scene3D\nscene:\n  kind: Node3D\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.path).toBe('version');
    expect(explanation!.version).toBe(99);
  });

  it('explains a dimension mismatch in valid YAML', () => {
    const yaml = 'flight: 1\nkind: Scene2D\nscene:\n  kind: DisplayObject\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('kind');
  });

  it('explains a duplicate ambient light from text', () => {
    const yaml = [
      'flight: 1',
      'kind: Scene3D',
      'scene:',
      '  kind: Node3D',
      'lights:',
      '  - descriptor:',
      '      kind: AmbientLight',
      '  - descriptor:',
      '      kind: AmbientLight',
    ].join('\n');
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateAmbientLight);
    expect(explanation!.path).toBe('lights');
  });

  it('explains a duplicate directional light from text', () => {
    const yaml = [
      'flight: 1',
      'kind: Scene3D',
      'scene:',
      '  kind: Node3D',
      'lights:',
      '  - descriptor:',
      '      kind: DirectionalLight',
      '  - descriptor:',
      '      kind: DirectionalLight',
    ].join('\n');
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml);
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateDirectionalLight);
    expect(explanation!.path).toBe('lights');
  });

  it('returns null for valid Scene3D text', () => {
    const yaml = 'flight: 1\nkind: Scene3D\nscene:\n  kind: Node3D\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml);
    expect(explanation).toBeNull();
  });
});

describe('Scene3DDocumentCamera', () => {
  it('has no direction field', () => {
    expectTypeOf<keyof Scene3DDocumentCamera>().toEqualTypeOf<
      'far' | 'name' | 'near' | 'node' | 'projection' | 'transform'
    >();
  });
});

describe('Scene3DDocumentLight', () => {
  it('has no direction field', () => {
    expectTypeOf<keyof Scene3DDocumentLight>().toEqualTypeOf<'descriptor' | 'name' | 'node' | 'transform'>();
  });
});

function createTestSchemas(): FlightDocumentSchemaRegistry {
  const node3DSchema: FlightDocumentNodeSchema = {
    createNode: (_fields: Readonly<FlightDocumentFields>, _resources: FlightDocumentResourceLookup) => {
      return createNode3D();
    },
    fields: [],
    kind: Node3DKind,
    writeNodeFields: (_out: FlightDocumentFields, _source: Readonly<NodeAny>) => {
      return true;
    },
  };

  let nodeSchemas = createKeyedTable<FlightDocumentNodeSchema>('flight-document.node', 'none');
  nodeSchemas = withRegistryTableEntry(nodeSchemas, Node3DKind, node3DSchema);

  return {
    nodeSchemas,
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}
