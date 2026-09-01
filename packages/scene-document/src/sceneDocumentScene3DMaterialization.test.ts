import { createTransform3D, createVector3, setQuaternionFromAxisAngle } from '@flighthq/geometry/contract';
import {
  createAmbientLight,
  createDirectionalLight,
  createHemisphereLight,
  createPointLight,
  createSpotLight,
} from '@flighthq/lighting/contract';
import { getNodeChildren, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import { createNode3D, createScene3D } from '@flighthq/scene3d/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentInteractiveStates,
  FlightDocumentNodeSchema,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentScene,
  FlightDocumentScene3DMaterialization,
  FlightDocumentSchemaRegistry,
  Light,
  NodeAny,
  Scene3DLightsLike,
  Scene3DDocumentCamera,
  Scene3DDocumentLight,
} from '@flighthq/types/contract';
import {
  AmbientLightKind,
  DirectionalLightKind,
  DisplayObjectKind,
  FlightDocumentRefusalReason,
  Node3DKind,
} from '@flighthq/types/contract';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { formatFlightDocumentText } from './flightDocumentText';
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

  it('writes interactive metadata only from explicit bindings', () => {
    const scene = createScene3D();
    const states: FlightDocumentInteractiveStates = {
      disabled: { alpha: 0.4, extensions: [] },
      hover: null,
      pressed: null,
    };
    const documentWithoutBindings = createFlightDocumentFromScene3D(scene, [], [], createTestSchemas());
    const documentWithBindings = createFlightDocumentFromScene3D(scene, [], [], createTestSchemas(), [
      { interactiveStates: states, node: scene.root, transition: null },
    ]);

    expect(documentWithoutBindings.scene.interactiveStates).toBeNull();
    expect(documentWithBindings.scene.interactiveStates).toEqual(states);
  });

  it('writes layouts only from the optional explicit binding argument after interactive bindings', () => {
    const scene = createScene3D({ name: 'world' });
    const tree = {
      nodes: [{ containerStyle: { custom: true }, itemStyle: null, kind: 'acme.World', parentIndex: -1 }],
    };

    expect(createFlightDocumentFromScene3D(scene, [], [], createTestSchemas()).layouts).toEqual([]);
    expect(
      createFlightDocumentFromScene3D(scene, [], [], createTestSchemas(), [], [{ targets: [scene.root], tree }]),
    ).toMatchObject({ layouts: [{ targets: ['world'], tree }] });
  });
});

describe('createFlightDocumentScene3DMaterialization', () => {
  it('materializes an empty Scene3D from a minimal model', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    expect(materialization.scene).toBeDefined();
    expect(materialization.cameras).toHaveLength(0);
    expect(materialization.lights).toBeDefined();
  });

  it('materializes cameras from document camera descriptors', () => {
    const document = createTestDocument({
      cameras: [
        {
          far: 500,
          near: 0.5,
          projection: { aspect: 1.77, fovY: 1.047, kind: 'perspective' },
          transform: createTransform3D(),
        },
      ],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    expect(materialization.cameras).toHaveLength(1);
    expect(materialization.cameras[0].far).toBe(500);
    expect(materialization.cameras[0].near).toBe(0.5);
    expect(materialization.cameras[0].projection.kind).toBe('perspective');
  });

  it('applies authored camera placement to the runtime view matrix', () => {
    const transform = createTransform3D();
    transform.position.x = 7;
    const document = createTestDocument({
      cameras: [
        {
          far: 500,
          near: 0.5,
          projection: { aspect: 1.77, fovY: 1.047, kind: 'perspective' },
          transform,
        },
      ],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });

    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());

    expect(result?.cameras[0].view.m[12]).toBe(-7);
  });

  it('applies a bound depth-first node placement to the runtime camera', () => {
    const transform = createTransform3D();
    transform.position.x = 7;
    const document = createTestDocument({
      cameras: [
        {
          far: 500,
          near: 0.5,
          node: 2,
          projection: { aspect: 1.77, fovY: 1.047, kind: 'perspective' },
          transform,
        },
      ],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: {
        children: [
          {
            children: [{ children: [], fields: { positionX: 3 }, kind: Node3DKind }],
            fields: { positionX: 2 },
            kind: Node3DKind,
          },
        ],
        fields: {},
        kind: Node3DKind,
      },
      tokens: [],
    });

    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());

    expect(result?.cameras[0].view.m[12]).toBe(-5);
  });

  it('preserves the source-derived representable light population and authored placement', () => {
    const transform = createTransform3D();
    transform.position.x = 10;
    transform.position.y = 20;
    transform.position.z = 30;
    transform.scale.x = 2;
    transform.scale.y = 3;
    transform.scale.z = 4;
    setQuaternionFromAxisAngle(transform.rotation, createVector3(0, 1, 0), Math.PI / 2);
    const authoredLights: Required<Scene3DLightsLike> = {
      ambient: createAmbientLight(),
      directional: createDirectionalLight({ direction: { x: 0, y: 0, z: -1 } }),
      hemisphere: [createHemisphereLight()],
      point: [createPointLight({ position: { x: 1, y: 0, z: 0 } })],
      spot: [createSpotLight({ direction: { x: 0, y: 0, z: -1 }, position: { x: 1, y: 0, z: 0 } })],
    };
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: getDocumentLights(authoredLights, transform),
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });

    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());

    expect(getScene3DLightKinds(result?.lights ?? null).sort()).toEqual(getScene3DLightKinds(authoredLights).sort());
    expect(result?.lights.directional?.direction.x).toBeCloseTo(-1);
    expect(result?.lights.directional?.direction.y).toBeCloseTo(0);
    expect(result?.lights.directional?.direction.z).toBeCloseTo(0);
    expect(result?.lights.point?.[0].position).toMatchObject({ x: 10, y: 20, z: 28 });
    expect(result?.lights.spot?.[0].position).toMatchObject({ x: 10, y: 20, z: 28 });
    expect(result?.lights.spot?.[0].direction.x).toBeCloseTo(-1);
    expect(result?.lights.spot?.[0].direction.y).toBeCloseTo(0);
    expect(result?.lights.spot?.[0].direction.z).toBeCloseTo(0);
  });

  it('applies a bound depth-first node placement to a punctual light', () => {
    const transform = createTransform3D();
    transform.position.x = 7;
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [{ descriptor: createPointLight(), node: 2, transform }],
      scene: {
        children: [
          {
            children: [{ children: [], fields: { positionX: 3 }, kind: Node3DKind }],
            fields: { positionX: 2 },
            kind: Node3DKind,
          },
        ],
        fields: {},
        kind: Node3DKind,
      },
      tokens: [],
    });

    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());

    expect(result?.lights.point?.[0].position).toMatchObject({ x: 5, y: 0, z: 0 });
  });

  it('materializes a tree with children', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: {
        children: [{ children: [], fields: {}, kind: Node3DKind }],
        fields: {},
        kind: Node3DKind,
      },
      tokens: [],
    });
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene3DMaterialization(document, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    const rootChildren = getNodeChildren(materialization.scene.root);
    expect(rootChildren).toHaveLength(1);
    expect(rootChildren[0].kind).toBe(Node3DKind);
  });

  it('returns null for a Scene2D document', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      layouts: [],
      scene: { children: [], fields: {}, kind: 'DisplayObject' },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for an unsupported version', () => {
    const document = {
      ...createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [],
        scene: { children: [], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
      version: 99,
    } as unknown as FlightDocument;
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for duplicate ambient lights', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [
        { descriptor: createAmbientLight(), transform: createTransform3D() },
        { descriptor: createAmbientLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for duplicate directional lights', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [
        { descriptor: createDirectionalLight(), transform: createTransform3D() },
        { descriptor: createDirectionalLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });
});

describe('createFlightDocumentScene3DMaterializationFromText', () => {
  it('materializes a Scene3D from YAML text', () => {
    const yaml = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene3D',
      '    scene:',
      '      kind: Node3D',
    ].join('\n');
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene3DMaterializationFromText(yaml, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene3DMaterialization;
    expect(materialization.scene).toBeDefined();
  });

  it('returns null for a Scene2D YAML document', () => {
    const yaml = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene2D',
      '    scene:',
      '      kind: DisplayObject',
    ].join('\n');
    const result = createFlightDocumentScene3DMaterializationFromText(yaml, createTestSchemas());
    expect(result).toBeNull();
  });
});

describe('explainFlightDocumentScene3DRefusal', () => {
  it('explains a dimension mismatch', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      layouts: [],
      scene: { children: [], fields: {}, kind: 'DisplayObject' },
      tokens: [],
    });
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('scenes[0].kind');
  });

  it('explains an unsupported version', () => {
    const document = {
      ...createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [],
        scene: { children: [], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
      version: 99,
    } as unknown as FlightDocument;
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.path).toBe('version');
    expect(explanation!.version).toBe(99);
  });

  it('explains a duplicate ambient light', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [
        { descriptor: createAmbientLight(), transform: createTransform3D() },
        { descriptor: createAmbientLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateAmbientLight);
    expect(explanation!.path).toBe('scenes[0].lights');
  });

  it('explains a duplicate directional light', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [
        { descriptor: createDirectionalLight(), transform: createTransform3D() },
        { descriptor: createDirectionalLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
      ],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateDirectionalLight);
    expect(explanation!.path).toBe('scenes[0].lights');
  });

  it('returns null when the document is valid', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: { children: [], fields: {}, kind: Node3DKind },
      tokens: [],
    });
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).toBeNull();
  });
});

describe('explainFlightDocumentScene3DRefusalFromText', () => {
  it('explains an anchor refusal with parser position', () => {
    const yaml = 'flight: 1\nkind: Scene3D\nanchor: &ref value\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.AnchorUnsupported);
    expect(explanation!.line).toBeGreaterThan(0);
  });

  it('explains a version mismatch in valid YAML', () => {
    const yaml = 'flight: 99\ndefaultScene: 0\nscenes:\n  - kind: Scene3D\n    scene:\n      kind: Node3D\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.path).toBe('version');
    expect(explanation!.version).toBe(99);
  });

  it('explains a dimension mismatch in valid YAML', () => {
    const yaml = 'flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('scenes[0].kind');
  });

  it('explains a duplicate ambient light from text', () => {
    const yaml = formatFlightDocumentText(
      createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [
          { descriptor: createAmbientLight(), transform: createTransform3D() },
          { descriptor: createAmbientLight(), transform: createTransform3D() },
        ],
        scene: { children: [], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
    );
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateAmbientLight);
    expect(explanation!.path).toBe('scenes[0].lights');
  });

  it('explains a duplicate directional light from text', () => {
    const yaml = formatFlightDocumentText(
      createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [
          { descriptor: createDirectionalLight(), transform: createTransform3D() },
          { descriptor: createDirectionalLight(), transform: createTransform3D() },
        ],
        scene: { children: [], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
    );
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DuplicateDirectionalLight);
    expect(explanation!.path).toBe('scenes[0].lights');
  });

  it('returns null for valid Scene3D text', () => {
    const yaml = 'flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene3D\n    scene:\n      kind: Node3D\n';
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).toBeNull();
  });
});

describe('model-to-text explain parity', () => {
  // Keep the table annotated so every fixture is checked against the container schema rather than inferred
  // only from its own literal.
  it.each<{
    document: Readonly<FlightDocument>;
    expectedPath: string;
    expectedReason: FlightDocumentRefusalReason;
    label: string;
  }>([
    {
      label: 'duplicate ambient (scene 0)',
      document: createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [
          { descriptor: createAmbientLight(), transform: createTransform3D() },
          { descriptor: createAmbientLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
        ],
        scene: { children: [], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
      expectedReason: FlightDocumentRefusalReason.DuplicateAmbientLight,
      expectedPath: 'scenes[0].lights',
    },
    {
      label: 'duplicate directional (scene 0)',
      document: createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [
          { descriptor: createDirectionalLight(), transform: createTransform3D() },
          { descriptor: createDirectionalLight({ color: 0xccccccff, intensity: 0.5 }), transform: createTransform3D() },
        ],
        scene: { children: [], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
      expectedReason: FlightDocumentRefusalReason.DuplicateDirectionalLight,
      expectedPath: 'scenes[0].lights',
    },
    {
      label: 'wrong dimension (scene 0)',
      document: createTestDocument({
        backgroundColor: null,
        kind: 'Scene2D',
        layouts: [],
        scene: { children: [], fields: {}, kind: 'DisplayObject' },
        tokens: [],
      }),
      expectedReason: FlightDocumentRefusalReason.StructureInvalid,
      expectedPath: 'scenes[0].kind',
    },
    {
      label: 'unregistered node kind (scene 0)',
      document: createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [],
        scene: { children: [{ children: [], fields: {}, kind: 'acme.Unknown' }], fields: {}, kind: Node3DKind },
        tokens: [],
      }),
      expectedReason: FlightDocumentRefusalReason.NodeKindUnregistered,
      expectedPath: 'scenes[0].scene.children[0]',
    },
  ])('model and text explain agree on $label', ({ document, expectedPath, expectedReason }) => {
    const modelResult = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    const text = formatFlightDocumentText(document);
    const textResult = explainFlightDocumentScene3DRefusalFromText(text, createTestSchemas());
    expect(modelResult).not.toBeNull();
    expect(textResult).not.toBeNull();
    expect(textResult!.reason).toBe(modelResult!.reason);
    expect(textResult!.path).toBe(modelResult!.path);
    expect(modelResult!.reason).toBe(expectedReason);
    expect(modelResult!.path).toBe(expectedPath);
  });
});

describe('NodeKindUnregistered', () => {
  it('materializer returns null for nested unregistered kind two levels deep', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: {
        children: [
          {
            children: [{ children: [], fields: {}, kind: 'acme.Unknown' }],
            fields: {},
            kind: Node3DKind,
          },
        ],
        fields: {},
        kind: Node3DKind,
      },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('explain names the unregistered kind with qualified scene path', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: {
        children: [
          {
            children: [{ children: [], fields: {}, kind: 'acme.Unknown' }],
            fields: {},
            kind: Node3DKind,
          },
        ],
        fields: {},
        kind: Node3DKind,
      },
      tokens: [],
    });
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.NodeKindUnregistered);
    expect(explanation!.kind).toBe('acme.Unknown');
    expect(explanation!.path).toBe('scenes[0].scene.children[0].children[0]');
  });

  it('registration mutation control: same tree passes when kind is registered', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      layouts: [],
      lights: [],
      scene: {
        children: [
          {
            children: [{ children: [], fields: {}, kind: Node3DKind }],
            fields: {},
            kind: Node3DKind,
          },
        ],
        fields: {},
        kind: Node3DKind,
      },
      tokens: [],
    });
    const result = createFlightDocumentScene3DMaterialization(document, createTestSchemas());
    expect(result).not.toBeNull();
    const explanation = explainFlightDocumentScene3DRefusal(document, createTestSchemas());
    expect(explanation).toBeNull();
  });

  it('text explain reports unregistered kind from YAML', () => {
    const yaml = formatFlightDocumentText(
      createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        layouts: [],
        lights: [],
        scene: {
          children: [{ children: [], fields: {}, kind: 'acme.Unknown' }],
          fields: {},
          kind: Node3DKind,
        },
        tokens: [],
      }),
    );
    const explanation = explainFlightDocumentScene3DRefusalFromText(yaml, createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.NodeKindUnregistered);
    expect(explanation!.kind).toBe('acme.Unknown');
    expect(explanation!.path).toBe('scenes[0].scene.children[0]');
  });
});

describe('Scene3D interactive-state materialization', () => {
  it('returns an inert binding for the exact live root', () => {
    const schemas = createTestSchemas();
    const document = rootDocument3D(Node3DKind, {}, schemas);
    document.scenes[0].scene.interactiveStates = {
      disabled: { alpha: 0.4, extensions: [] },
      hover: null,
      pressed: null,
    };

    const materialization = createFlightDocumentScene3DMaterialization(document, schemas);

    expect(materialization).not.toBeNull();
    expect(materialization!.interactiveStateBindings).toHaveLength(1);
    expect(materialization!.interactiveStateBindings[0]?.node).toBe(materialization!.scene.root);
    expect(materialization!.scene.root.alpha).toBe(1);
  });
});

describe('Scene3D layout materialization', () => {
  it('returns an inert binding for a named 3D root without consulting a layout resolver', () => {
    const schemas = createTestSchemas();
    const document = rootDocument3D(Node3DKind, { name: 'world' }, schemas);
    document.scenes[0].layouts = [
      {
        targets: ['world'],
        tree: { nodes: [{ containerStyle: { custom: true }, itemStyle: null, kind: 'acme.World', parentIndex: -1 }] },
      },
    ];

    const materialization = createFlightDocumentScene3DMaterialization(document, schemas);

    expect(materialization).not.toBeNull();
    expect(materialization!.layoutBindings[0]?.targets).toEqual([materialization!.scene.root]);
    expect(materialization!.layoutBindings[0]?.tree).toBe(document.scenes[0].layouts[0]?.tree);
  });
});

// ★ ROOT-NODE FIDELITY, 3D half. Same defect as 2D: the reader built a fresh container and materialized
// only the authored root's children, so the root's own kind and fields were dropped while the writer
// captured them.
describe('Scene3D root fidelity', () => {
  it('preserves the authored root kind', () => {
    const schemas = createTestSchemas();
    const document = rootDocument3D(Node3DKind, {}, schemas);
    const materialization = createFlightDocumentScene3DMaterialization(document, schemas);
    expect(materialization).not.toBeNull();
    expect(materialization!.scene.root.kind).toBe(Node3DKind);
  });

  it('preserves fields authored on the root', () => {
    const schemas = createTestSchemas();
    const document = rootDocument3D(Node3DKind, { name: 'authored-root' }, schemas);
    const materialization = createFlightDocumentScene3DMaterialization(document, schemas);
    expect(materialization).not.toBeNull();
    expect(materialization!.scene.root.name).toBe('authored-root');
  });

  it('refuses a registered root whose kind belongs to the other dimension', () => {
    const schemas = createTestSchemas();
    schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, DisplayObjectKind, {
      createNode: () => createDisplayObject() as unknown as NodeAny,
      fields: [],
      kind: DisplayObjectKind,
      writeNodeFields: () => true,
    });
    const document = rootDocument3D(DisplayObjectKind, {}, schemas);
    expect(createFlightDocumentScene3DMaterialization(document, schemas)).toBeNull();
    expect(explainFlightDocumentScene3DRefusal(document, schemas)).toMatchObject({
      reason: FlightDocumentRefusalReason.RootKindMismatch,
    });
  });

  it('passes a genuinely empty resource map to a root-dimension probe', () => {
    const schemas = createTestSchemas();
    let resourceKeys: string[] | null = null;
    schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, DisplayObjectKind, {
      createNode: (_fields, resources) => {
        resourceKeys = Object.keys(resources);
        return createDisplayObject() as unknown as NodeAny;
      },
      fields: [],
      kind: DisplayObjectKind,
      writeNodeFields: () => true,
    });

    explainFlightDocumentScene3DRefusal(rootDocument3D(DisplayObjectKind, {}, schemas), schemas);

    expect(resourceKeys).toEqual([]);
  });
});

describe('Scene3DDocumentCamera', () => {
  it('has no direction field', () => {
    expectTypeOf<keyof Scene3DDocumentCamera>().toEqualTypeOf<
      'far' | 'name' | 'near' | 'node' | 'projection' | 'transform'
    >();
  });
});

function createTestDocument(
  scene: FlightDocumentScene,
  resources: FlightDocumentResourceDescriptor[] = [],
): FlightDocument {
  return { defaultScene: 0, resources, scenes: [scene], version: 1 };
}

function createTestSchemas(): FlightDocumentSchemaRegistry {
  const node3DSchema: FlightDocumentNodeSchema = {
    createNode: (fields: Readonly<FlightDocumentFields>, _resources: FlightDocumentResourceLookup) => {
      const node = createNode3D();
      const name = fields['name'];
      if (typeof name === 'string') node.name = name;
      const positionX = fields['positionX'];
      if (typeof positionX === 'number') {
        node.position.x = positionX;
        invalidateNodeLocalTransform(node);
      }
      return node;
    },
    fields: [
      {
        name: 'name',
        required: false,
        validate: (value) => typeof value === 'string' || value === null,
      },
      {
        name: 'positionX',
        required: false,
        validate: (value) => typeof value === 'number',
      },
    ],
    kind: Node3DKind,
    writeNodeFields: (out: FlightDocumentFields, source: Readonly<NodeAny>) => {
      if (source.name !== null) out['name'] = source.name;
      return true;
    },
  };

  let nodeSchemas = createKeyedTable<FlightDocumentNodeSchema>('flight-document.node', 'none');
  nodeSchemas = withRegistryTableEntry(nodeSchemas, Node3DKind, node3DSchema);

  return {
    interactiveStateExtensionSchemas: createKeyedTable('flight-document.interactive-state-extension', 'none'),
    interactiveStateTransitionSchemas: createKeyedTable('flight-document.interactive-state-transition', 'none'),
    nodeSchemas,
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}

describe('Scene3DDocumentLight', () => {
  it('has no direction field', () => {
    expectTypeOf<keyof Scene3DDocumentLight>().toEqualTypeOf<'descriptor' | 'name' | 'node' | 'transform'>();
  });
});

function rootDocument3D(
  kind: string,
  fields: Record<string, unknown>,
  schemas: FlightDocumentSchemaRegistry,
): FlightDocument {
  schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, Node3DKind, {
    createNode: (nodeFields) => {
      const node = createNode3D();
      if (typeof nodeFields['name'] === 'string') node.name = nodeFields['name'];
      return node as unknown as NodeAny;
    },
    fields: [
      {
        name: 'name',
        required: false,
        validate: (value) => typeof value === 'string' || value === null,
      },
    ],
    kind: Node3DKind,
    writeNodeFields: () => true,
  });
  return {
    defaultScene: 0,
    resources: [],
    scenes: [
      { cameras: [], kind: 'Scene3D', layouts: [], lights: [], scene: { children: [], fields, kind }, tokens: [] },
    ],
    version: 1,
  } as unknown as FlightDocument;
}

function getDocumentLights(
  source: Readonly<Required<Scene3DLightsLike>>,
  transform: Readonly<Scene3DDocumentLight['transform']>,
): Scene3DDocumentLight[] {
  return getScene3DLights(source).map((descriptor) => ({ descriptor, transform }));
}

function getScene3DLightKinds(source: Readonly<Scene3DLightsLike> | null): string[] {
  return source === null ? [] : getScene3DLights(source).map((light) => light.kind);
}

function getScene3DLights(source: Readonly<Scene3DLightsLike>): Readonly<Light>[] {
  const lights: Readonly<Light>[] = [];
  for (const value of Object.values(source)) {
    if (value === null) continue;
    if ('kind' in value) lights.push(value);
    else lights.push(...value);
  }
  return lights;
}
