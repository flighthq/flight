import { addNodeChild, getNodeChildren, getNodeRuntime } from '@flighthq/node/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createDisplayObject, createScene2D, createSprite } from '@flighthq/scene2d/contract';
import { createNode3D } from '@flighthq/scene3d/contract';
import { DisplayObjectKind, FlightDocumentRefusalReason, Node3DKind, SpriteKind } from '@flighthq/types/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentInteractiveStates,
  FlightDocumentNodeSchema,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentScene,
  FlightDocumentScene2DMaterialization,
  FlightDocumentSchemaRegistry,
  Node2D,
  NodeAny,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { formatFlightDocumentText } from './flightDocumentText';
import {
  createFlightDocumentFromScene2D,
  createFlightDocumentScene2DMaterialization,
  createFlightDocumentScene2DMaterializationFromText,
  explainFlightDocumentRefusal,
  explainFlightDocumentRefusalFromText,
} from './sceneDocumentScene2DMaterialization';

describe('createFlightDocumentFromScene2D', () => {
  it('creates a model from an empty Scene2D', () => {
    const scene = createScene2D();
    const document = createFlightDocumentFromScene2D(scene, createTestSchemas());
    expect(document.kind).toBe('Scene2D');
    expect(document.scene.children).toHaveLength(0);
  });

  it('elides default-valued fields', () => {
    const scene = createScene2D();
    const obj = createDisplayObject({ name: 'default' });
    addNodeChild(scene.root, obj);
    const schemas = createTestSchemas();
    const document = createFlightDocumentFromScene2D(scene, schemas);
    const child = document.scene.children[0];
    expect(child.fields['x']).toBeUndefined();
    expect(child.fields['y']).toBeUndefined();
    expect(child.fields['scaleX']).toBeUndefined();
    expect(child.fields['rotation']).toBeUndefined();
    expect(child.fields['alpha']).toBeUndefined();
  });

  it('preserves transform fields', () => {
    const scene = createScene2D();
    const obj = createDisplayObject({ name: 'moved' });
    obj.x = 100;
    obj.y = 200;
    obj.scaleX = 2;
    obj.scaleY = 3;
    obj.rotation = 45;
    obj.alpha = 0.5;
    addNodeChild(scene.root, obj);
    const schemas = createTestSchemas();
    const document = createFlightDocumentFromScene2D(scene, schemas);
    const child = document.scene.children[0];
    expect(child.fields['x']).toBe(100);
    expect(child.fields['y']).toBe(200);
    expect(child.fields['scaleX']).toBe(2);
    expect(child.fields['scaleY']).toBe(3);
    expect(child.fields['rotation']).toBe(45);
    expect(child.fields['alpha']).toBe(0.5);
  });

  it('writes interactive metadata only from explicit bindings', () => {
    const scene = createScene2D();
    const states: FlightDocumentInteractiveStates = {
      disabled: null,
      hover: { alpha: 0.75, extensions: [] },
      pressed: null,
    };
    const documentWithoutBindings = createFlightDocumentFromScene2D(scene, createTestSchemas());
    const documentWithBindings = createFlightDocumentFromScene2D(scene, createTestSchemas(), [
      { interactiveStates: states, node: scene.root, transition: null },
    ]);

    expect(documentWithoutBindings.scene.interactiveStates).toBeNull();
    expect(documentWithBindings.scene.interactiveStates).toEqual(states);
  });

  it('rejects duplicate and foreign explicit bindings', () => {
    const scene = createScene2D();
    const states: FlightDocumentInteractiveStates = {
      disabled: null,
      hover: { alpha: 0.75, extensions: [] },
      pressed: null,
    };
    const binding = { interactiveStates: states, node: scene.root, transition: null };

    expect(() => createFlightDocumentFromScene2D(scene, createTestSchemas(), [binding, binding])).toThrow(RangeError);
    expect(() =>
      createFlightDocumentFromScene2D(scene, createTestSchemas(), [
        { interactiveStates: states, node: createDisplayObject(), transition: null },
      ]),
    ).toThrow(RangeError);
  });

  it('serializes children into nested nodes', () => {
    const scene = createScene2D();
    const sprite = createSprite({ name: 'hero' });
    addNodeChild(scene.root, sprite);
    const schemas = createTestSchemas();
    const document = createFlightDocumentFromScene2D(scene, schemas);
    expect(document.scene.children).toHaveLength(1);
    expect(document.scene.children[0].kind).toBe(SpriteKind);
  });
});

describe('createFlightDocumentScene2DMaterialization', () => {
  it('materializes an empty Scene2D from a minimal model', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: { children: [], fields: {}, kind: DisplayObjectKind },
    });
    const result = createFlightDocumentScene2DMaterialization(document, createTestSchemas());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    expect(materialization.scene).toBeDefined();
    expect(materialization.scene.root).toBeDefined();
  });

  it('materializes a tree with nested children', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: {
        children: [
          {
            children: [{ children: [], fields: {}, kind: SpriteKind }],
            fields: {},
            kind: DisplayObjectKind,
          },
        ],
        fields: {},
        kind: DisplayObjectKind,
      },
    });
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene2DMaterialization(document, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    const rootChildren = getNodeChildren(materialization.scene.root);
    expect(rootChildren).toHaveLength(1);
    expect(rootChildren[0].kind).toBe(DisplayObjectKind);
    const grandchildren = getNodeChildren(rootChildren[0]);
    expect(grandchildren).toHaveLength(1);
    expect(grandchildren[0].kind).toBe(SpriteKind);
  });

  it('returns null for a Scene3D document', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      scene: { children: [], fields: {}, kind: 'Node3D' },
    });
    const result = createFlightDocumentScene2DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for an unsupported version', () => {
    const document = {
      ...createTestDocument({
        backgroundColor: null,
        kind: 'Scene2D',
        scene: { children: [], fields: {}, kind: DisplayObjectKind },
      }),
      version: 99,
    } as unknown as FlightDocument;
    const result = createFlightDocumentScene2DMaterialization(document, createTestSchemas());
    expect(result).toBeNull();
  });
});

describe('createFlightDocumentScene2DMaterializationFromText', () => {
  it('materializes a Scene2D from YAML text', () => {
    const yaml = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene2D',
      '    scene:',
      '      kind: DisplayObject',
      '      children:',
      '        - kind: Sprite',
      '          name: bg',
    ].join('\n');
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    expect(materialization.scene).toBeDefined();
  });

  it('returns null for a Scene3D YAML document', () => {
    const yaml = [
      'flight: 1',
      'defaultScene: 0',
      'scenes:',
      '  - kind: Scene3D',
      '    scene:',
      '      kind: Node3D',
    ].join('\n');
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, createTestSchemas());
    expect(result).toBeNull();
  });

  it('returns null for unsupported YAML constructs', () => {
    const yaml = 'flight: 1\nkind: Scene2D\nanchor: &ref value\n';
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, createTestSchemas());
    expect(result).toBeNull();
  });
});

describe('explainFlightDocumentRefusal', () => {
  it('allows an omitted required registered field when its runtime default is declared', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: { children: [], fields: {}, kind: DisplayObjectKind },
    });
    const schemas = createTestSchemas();
    const schema = schemas.nodeSchemas.entries.get(DisplayObjectKind);
    if (schema?.state !== 'bound') throw new Error('expected DisplayObject schema');
    schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, DisplayObjectKind, {
      ...schema.value,
      fields: schema.value.fields.map((field) => (field.name === 'x' ? { ...field, required: true } : field)),
    });

    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toBeNull();
  });

  it('explains a dimension mismatch', () => {
    const document = createTestDocument({
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      scene: { children: [], fields: {}, kind: 'Node3D' },
    });
    const explanation = explainFlightDocumentRefusal(document, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('scenes[0].kind');
  });

  it('explains an invalid registered field on a nested node', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: {
        children: [{ children: [], fields: { x: 'far' }, kind: SpriteKind }],
        fields: {},
        kind: DisplayObjectKind,
      },
    });
    const schemas = createTestSchemas();

    expect(createFlightDocumentScene2DMaterialization(document, schemas)).toBeNull();
    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toMatchObject({
      path: 'scenes[0].scene.children[0].x',
      reason: FlightDocumentRefusalReason.FieldInvalid,
    });
  });

  it('explains a missing required registered field', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: { children: [], fields: {}, kind: DisplayObjectKind },
    });
    const schemas = createTestSchemas();
    const schema = schemas.nodeSchemas.entries.get(DisplayObjectKind);
    if (schema?.state !== 'bound') throw new Error('expected DisplayObject schema');
    schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, DisplayObjectKind, {
      ...schema.value,
      fields: schema.value.fields.map((field) => (field.name === 'name' ? { ...field, required: true } : field)),
    });

    expect(createFlightDocumentScene2DMaterialization(document, schemas)).toBeNull();
    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toMatchObject({
      path: 'scenes[0].scene.name',
      reason: FlightDocumentRefusalReason.FieldInvalid,
    });
  });

  it('explains an unknown field for a registered node kind', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: { children: [], fields: { mystery: 1 }, kind: DisplayObjectKind },
    });
    const schemas = createTestSchemas();

    expect(createFlightDocumentScene2DMaterialization(document, schemas)).toBeNull();
    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toMatchObject({
      path: 'scenes[0].scene.mystery',
      reason: FlightDocumentRefusalReason.FieldInvalid,
    });
  });

  it('explains an unsupported version', () => {
    const document = {
      ...createTestDocument({
        backgroundColor: null,
        kind: 'Scene2D',
        scene: { children: [], fields: {}, kind: DisplayObjectKind },
      }),
      version: 99,
    } as unknown as FlightDocument;
    const explanation = explainFlightDocumentRefusal(document, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.version).toBe(99);
  });

  it('returns null when the document is valid', () => {
    const document = createTestDocument({
      backgroundColor: null,
      kind: 'Scene2D',
      scene: { children: [], fields: {}, kind: DisplayObjectKind },
    });
    const explanation = explainFlightDocumentRefusal(document, 'Scene2D', createTestSchemas());
    expect(explanation).toBeNull();
  });
});

describe('explainFlightDocumentRefusalFromText', () => {
  it('explains an anchor refusal with parser position', () => {
    const yaml = 'flight: 1\nkind: Scene2D\nanchor: &ref value\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.AnchorUnsupported);
    expect(explanation!.line).toBeGreaterThan(0);
    expect(explanation!.column).toBeGreaterThan(0);
    expect(explanation!.offset).toBeGreaterThanOrEqual(0);
  });

  it('explains an alias refusal', () => {
    const yaml = 'flight: 1\nkind: Scene2D\nref: *alias\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.AliasUnsupported);
  });

  it('explains a tag refusal', () => {
    const yaml = 'flight: 1\nkind: Scene2D\ntyped: !custom value\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.TagUnsupported);
  });

  it('explains a document separator refusal', () => {
    const yaml = 'flight: 1\n---\nkind: Scene2D\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.DocumentSeparatorUnsupported);
  });

  it('explains a key limit refusal with limit and actual', () => {
    const longKey = 'k'.repeat(300);
    const yaml = 'flight: 1\nkind: Scene2D\n' + longKey + ': value\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.KeyCodeUnitsLimitExceeded);
    expect(explanation!.limit).toBe(256);
    expect(explanation!.actual).toBe(300);
    expect(explanation!.line).toBeGreaterThan(0);
    expect(explanation!.column).toBeGreaterThan(0);
    expect(explanation!.offset).toBeGreaterThanOrEqual(0);
  });

  it('returns null for valid Scene2D text', () => {
    const yaml = 'flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).toBeNull();
  });

  it('explains an unsupported version in valid YAML', () => {
    const yaml = 'flight: 99\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.path).toBe('version');
    expect(explanation!.version).toBe(99);
  });

  it('explains a dimension mismatch in valid YAML', () => {
    const yaml = 'flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene3D\n    scene:\n      kind: Node3D\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('scenes[0].kind');
  });
});

describe('formatFlightDocumentText', () => {
  it('round-trips a minimal Scene2D through model and text', () => {
    const scene = createScene2D();
    const schemas = createTestSchemas();
    const document = createTestDocument(createFlightDocumentFromScene2D(scene, schemas));
    const text = formatFlightDocumentText(document);
    expect(typeof text).toBe('string');
    expect(text).toContain('flight: 1');
    expect(text).toContain('kind: Scene2D');
  });

  it('round-trips a Scene2D with children through text', () => {
    const scene = createScene2D();
    const sprite = createSprite({ name: 'hero' });
    sprite.x = 50;
    sprite.y = 100;
    addNodeChild(scene.root, sprite);
    const schemas = createTestSchemas();
    const document = createTestDocument(createFlightDocumentFromScene2D(scene, schemas));
    const text = formatFlightDocumentText(document);
    const reparsed = createFlightDocumentScene2DMaterializationFromText(text, schemas);
    expect(reparsed).not.toBeNull();
  });
});

describe('model-to-text explain parity', () => {
  it.each<{
    document: Readonly<FlightDocument>;
    expectedPath: string;
    expectedReason: FlightDocumentRefusalReason;
    label: string;
  }>([
    {
      label: 'wrong dimension (scene 0)',
      document: createTestDocument({
        cameras: [],
        kind: 'Scene3D',
        lights: [],
        scene: { children: [], fields: {}, kind: 'Node3D' },
      }),
      expectedReason: FlightDocumentRefusalReason.StructureInvalid,
      expectedPath: 'scenes[0].kind',
    },
    {
      label: 'unregistered node kind (scene 0)',
      document: createTestDocument({
        backgroundColor: null,
        kind: 'Scene2D',
        scene: {
          children: [{ children: [], fields: {}, kind: 'acme.Unknown' }],
          fields: {},
          kind: DisplayObjectKind,
        },
      }),
      expectedReason: FlightDocumentRefusalReason.NodeKindUnregistered,
      expectedPath: 'scenes[0].scene.children[0]',
    },
  ])('model and text explain agree on $label', ({ document, expectedPath, expectedReason }) => {
    const modelResult = explainFlightDocumentRefusal(document, 'Scene2D', createTestSchemas());
    const text = formatFlightDocumentText(document);
    const textResult = explainFlightDocumentRefusalFromText(text, 'Scene2D', createTestSchemas());
    expect(modelResult).not.toBeNull();
    expect(textResult).not.toBeNull();
    expect(textResult!.reason).toBe(modelResult!.reason);
    expect(textResult!.path).toBe(modelResult!.path);
    expect(modelResult!.reason).toBe(expectedReason);
    expect(modelResult!.path).toBe(expectedPath);
  });
});

describe('Scene2D interactive-state materialization', () => {
  it('returns inert bindings for the exact root and nested live nodes', () => {
    const document = rootDocument2D(DisplayObjectKind, { alpha: 0.5 });
    document.scenes[0].scene.interactiveStates = {
      disabled: null,
      hover: { alpha: 0.75, extensions: [] },
      pressed: null,
    };
    document.scenes[0].scene.children = [
      {
        children: [],
        fields: { name: 'nested' },
        interactiveStates: {
          disabled: { alpha: 0.25, extensions: [] },
          hover: null,
          pressed: null,
        },
        kind: DisplayObjectKind,
        transition: null,
      },
    ];

    const materialization = createFlightDocumentScene2DMaterialization(document, createTestSchemas());

    expect(materialization).not.toBeNull();
    const nested = getNodeChildren(materialization!.scene.root)[0] as Node2D;
    expect(materialization!.interactiveStateBindings.map((binding) => binding.node)).toEqual([
      materialization!.scene.root,
      nested,
    ]);
    expect(materialization!.scene.root.alpha).toBe(0.5);
    expect(getNodeRuntime(materialization!.scene.root).interactionSignals).toBeNull();
  });

  it('refuses an unregistered extension kind with its exact path', () => {
    const document = rootDocument2D(DisplayObjectKind, {});
    document.scenes[0].scene.interactiveStates = {
      disabled: null,
      hover: { extensions: [{ fields: { width: 2 }, kind: 'acme.Outline' }] },
      pressed: null,
    };

    expect(explainFlightDocumentRefusal(document, 'Scene2D', createTestSchemas())).toMatchObject({
      kind: 'acme.Outline',
      path: 'scenes[0].scene.interactiveStates.hover.extensions[0]',
      reason: FlightDocumentRefusalReason.InteractiveStateExtensionKindUnregistered,
    });
  });

  it('validates registered extension fields through the shared validator', () => {
    const schemas = createTestSchemas();
    schemas.interactiveStateExtensionSchemas = withRegistryTableEntry(
      schemas.interactiveStateExtensionSchemas,
      'acme.Outline',
      {
        createExtension: () => null,
        fields: [{ name: 'width', required: true, validate: (value) => typeof value === 'number' }],
        isSupported: () => true,
        kind: 'acme.Outline',
      },
    );
    const document = rootDocument2D(DisplayObjectKind, {});
    document.scenes[0].scene.interactiveStates = {
      disabled: null,
      hover: { extensions: [{ fields: { width: 'wide' }, kind: 'acme.Outline' }] },
      pressed: null,
    };

    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toMatchObject({
      path: 'scenes[0].scene.interactiveStates.hover.extensions[0].width',
      reason: FlightDocumentRefusalReason.FieldInvalid,
    });
  });

  it('refuses an unregistered transition kind', () => {
    const document = rootDocument2D(DisplayObjectKind, {});
    document.scenes[0].scene.interactiveStates = {
      disabled: null,
      hover: { alpha: 0.8, extensions: [] },
      pressed: null,
    };
    document.scenes[0].scene.transition = { fields: { duration: 100 }, kind: 'acme.Tween' };

    expect(explainFlightDocumentRefusal(document, 'Scene2D', createTestSchemas())).toMatchObject({
      kind: 'acme.Tween',
      path: 'scenes[0].scene.transition',
      reason: FlightDocumentRefusalReason.InteractiveStateTransitionKindUnregistered,
    });
  });
});

function createTestDocument(
  scene: FlightDocumentScene,
  resources: FlightDocumentResourceDescriptor[] = [],
): FlightDocument {
  return { defaultScene: 0, resources, scenes: [scene], version: 1 };
}

function createTestSchemas(): FlightDocumentSchemaRegistry {
  const displayObjectSchema: FlightDocumentNodeSchema = {
    createNode: (fields: Readonly<FlightDocumentFields>, _resources: FlightDocumentResourceLookup) => {
      const obj = createDisplayObject();
      applyTransformFields(obj, fields);
      return obj;
    },
    fields: TRANSFORM_FIELD_SCHEMAS,
    kind: DisplayObjectKind,
    writeNodeFields: (out: FlightDocumentFields, source: Readonly<NodeAny>) => {
      writeTransformFields(out, source as Node2D);
      return true;
    },
  };

  const spriteSchema: FlightDocumentNodeSchema = {
    createNode: (fields: Readonly<FlightDocumentFields>, _resources: FlightDocumentResourceLookup) => {
      const sprite = createSprite();
      applyTransformFields(sprite, fields);
      return sprite;
    },
    fields: TRANSFORM_FIELD_SCHEMAS,
    kind: SpriteKind,
    writeNodeFields: (out: FlightDocumentFields, source: Readonly<NodeAny>) => {
      writeTransformFields(out, source as Node2D);
      return true;
    },
  };

  let nodeSchemas = createKeyedTable<FlightDocumentNodeSchema>('flight-document.node', 'none');
  nodeSchemas = withRegistryTableEntry(nodeSchemas, DisplayObjectKind, displayObjectSchema);
  nodeSchemas = withRegistryTableEntry(nodeSchemas, SpriteKind, spriteSchema);

  return {
    interactiveStateExtensionSchemas: createKeyedTable('flight-document.interactive-state-extension', 'none'),
    interactiveStateTransitionSchemas: createKeyedTable('flight-document.interactive-state-transition', 'none'),
    nodeSchemas,
    resourceSchemas: createKeyedTable('flight-document.resource', 'none'),
    shapeCommandSchemas: createKeyedTable('flight-document.shape-command', 'none'),
  };
}

function applyTransformFields(target: Node2D, fields: Readonly<FlightDocumentFields>): void {
  if (typeof fields['name'] === 'string') target.name = fields['name'];
  if (typeof fields['x'] === 'number') target.x = fields['x'];
  if (typeof fields['y'] === 'number') target.y = fields['y'];
  if (typeof fields['scaleX'] === 'number') target.scaleX = fields['scaleX'];
  if (typeof fields['scaleY'] === 'number') target.scaleY = fields['scaleY'];
  if (typeof fields['rotation'] === 'number') target.rotation = fields['rotation'];
  if (typeof fields['alpha'] === 'number') target.alpha = fields['alpha'];
}

function writeTransformFields(out: FlightDocumentFields, source: Readonly<Node2D>): void {
  if (source.name !== null) out['name'] = source.name;
  if (source.x !== 0) out['x'] = source.x;
  if (source.y !== 0) out['y'] = source.y;
  if (source.scaleX !== 1) out['scaleX'] = source.scaleX;
  if (source.scaleY !== 1) out['scaleY'] = source.scaleY;
  if (source.rotation !== 0) out['rotation'] = source.rotation;
  if (source.alpha !== 1) out['alpha'] = source.alpha;
}

const TRANSFORM_FIELD_SCHEMAS = [
  {
    defaultValue: undefined,
    name: 'name',
    required: false,
    validate: (v: unknown) => typeof v === 'string' || v === null,
  },
  { defaultValue: 0, name: 'x', required: false, validate: (v: unknown) => typeof v === 'number' },
  { defaultValue: 0, name: 'y', required: false, validate: (v: unknown) => typeof v === 'number' },
  { defaultValue: 1, name: 'scaleX', required: false, validate: (v: unknown) => typeof v === 'number' },
  { defaultValue: 1, name: 'scaleY', required: false, validate: (v: unknown) => typeof v === 'number' },
  { defaultValue: 0, name: 'rotation', required: false, validate: (v: unknown) => typeof v === 'number' },
  { defaultValue: 1, name: 'alpha', required: false, validate: (v: unknown) => typeof v === 'number' },
] as const;

// ★ ROOT-NODE FIDELITY. The writer captures the root's kind and fields (`writeNode(source.root, …)`), but
// the reader built a fresh container with `createScene2D()` and materialized only `scene.children` — so
// everything authored ON the root was silently dropped. Write preserved what read discarded, which makes
// the round trip lossy in a way no per-child test could see.
describe('Scene2D root fidelity', () => {
  it('preserves the authored root kind', () => {
    const document = rootDocument2D(SpriteKind, {});
    const materialization = createFlightDocumentScene2DMaterialization(document, createTestSchemas());
    expect(materialization).not.toBeNull();
    expect(materialization!.scene.root.kind).toBe(SpriteKind);
  });

  it('preserves fields authored on the root', () => {
    const document = rootDocument2D(DisplayObjectKind, { x: 100, y: 200 });
    const materialization = createFlightDocumentScene2DMaterialization(document, createTestSchemas());
    expect(materialization).not.toBeNull();
    const root = materialization!.scene.root as unknown as { x: number; y: number };
    expect(root.x).toBe(100);
    expect(root.y).toBe(200);
  });

  it('round-trips a root with authored fields without losing them', () => {
    const schemas = createTestSchemas();
    const scene = createScene2D();
    (scene.root as unknown as { x: number; y: number }).x = 7;
    (scene.root as unknown as { x: number; y: number }).y = 9;

    const document = createFlightDocumentFromScene2D(scene, schemas);
    const wrapped = { defaultScene: 0, resources: [], scenes: [document], version: 1 } as unknown as FlightDocument;
    const back = createFlightDocumentScene2DMaterialization(wrapped, schemas);

    expect(back).not.toBeNull();
    const root = back!.scene.root as unknown as { x: number; y: number };
    expect(root.x).toBe(7);
    expect(root.y).toBe(9);
  });

  // ★ A REGISTERED kind of the WRONG DIMENSION is the interesting refusal: it is not an unregistered kind,
  // so the unregistered-kind check passes it through, and it then builds a Node3D as a 2D scene root.
  it('refuses a registered root whose kind belongs to the other dimension', () => {
    // The kind must be REGISTERED for this to be the case under test — an unregistered kind is caught one
    // check earlier, and that is a different refusal with a different remedy.
    const schemas = createTestSchemas();
    schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, Node3DKind, {
      createNode: () => createNode3D() as unknown as NodeAny,
      fields: [],
      kind: Node3DKind,
      writeNodeFields: () => true,
    });
    const document = rootDocument2D(Node3DKind, {});
    expect(createFlightDocumentScene2DMaterialization(document, schemas)).toBeNull();
    expect(explainFlightDocumentRefusal(document, 'Scene2D', schemas)).toMatchObject({
      reason: FlightDocumentRefusalReason.RootKindMismatch,
    });
  });

  it('passes a genuinely empty resource map to a root-dimension probe', () => {
    const schemas = createTestSchemas();
    let resourceKeys: string[] | null = null;
    schemas.nodeSchemas = withRegistryTableEntry(schemas.nodeSchemas, Node3DKind, {
      createNode: (_fields, resources) => {
        resourceKeys = Object.keys(resources);
        return createNode3D() as unknown as NodeAny;
      },
      fields: [],
      kind: Node3DKind,
      writeNodeFields: () => true,
    });

    explainFlightDocumentRefusal(rootDocument2D(Node3DKind, {}), 'Scene2D', schemas);

    expect(resourceKeys).toEqual([]);
  });
});

function rootDocument2D(kind: string, fields: Record<string, unknown>): FlightDocument {
  return {
    defaultScene: 0,
    resources: [],
    scenes: [
      {
        backgroundColor: null,
        kind: 'Scene2D',
        scene: { children: [], fields, kind },
      },
    ],
    version: 1,
  } as unknown as FlightDocument;
}
