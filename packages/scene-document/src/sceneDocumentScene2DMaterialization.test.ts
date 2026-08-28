import { addNodeChild, getNodeChildren } from '@flighthq/node/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createDisplayObject, createScene2D, createSprite } from '@flighthq/scene2d/contract';
import { DisplayObjectKind, FlightDocumentRefusalReason, SpriteKind } from '@flighthq/types/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
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

import {
  createFlightDocumentFromScene2D,
  createFlightDocumentScene2DMaterialization,
  createFlightDocumentScene2DMaterializationFromText,
  explainFlightDocumentRefusal,
  explainFlightDocumentRefusalFromText,
  serializeFlightDocument,
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
      'kind: Scene2D',
      'scene:',
      '  kind: DisplayObject',
      '  children:',
      '    - kind: Sprite',
      '      name: bg',
    ].join('\n');
    const schemas = createTestSchemas();
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, schemas);
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    expect(materialization.scene).toBeDefined();
  });

  it('returns null for a Scene3D YAML document', () => {
    const yaml = ['flight: 1', 'kind: Scene3D', 'scene:', '  kind: Node3D'].join('\n');
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
    const yaml = 'flight: 1\nkind: Scene2D\nscene:\n  kind: DisplayObject\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).toBeNull();
  });

  it('explains an unsupported version in valid YAML', () => {
    const yaml = 'flight: 99\nkind: Scene2D\nscene:\n  kind: DisplayObject\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(explanation!.path).toBe('version');
    expect(explanation!.version).toBe(99);
  });

  it('explains a dimension mismatch in valid YAML', () => {
    const yaml = 'flight: 1\nkind: Scene3D\nscene:\n  kind: Node3D\n';
    const explanation = explainFlightDocumentRefusalFromText(yaml, 'Scene2D', createTestSchemas());
    expect(explanation).not.toBeNull();
    expect(explanation!.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(explanation!.path).toBe('scenes[0].kind');
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
      label: 'unsupported version (document-level)',
      document: {
        ...createTestDocument({
          backgroundColor: null,
          kind: 'Scene2D',
          scene: { children: [], fields: {}, kind: DisplayObjectKind },
        }),
        version: 99,
      } as unknown as FlightDocument,
      expectedReason: FlightDocumentRefusalReason.VersionUnsupported,
      expectedPath: 'version',
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
    const text = serializeFlightDocument(document);
    const textResult = explainFlightDocumentRefusalFromText(text, 'Scene2D', createTestSchemas());
    expect(modelResult).not.toBeNull();
    expect(textResult).not.toBeNull();
    expect(textResult!.reason).toBe(modelResult!.reason);
    expect(textResult!.path).toBe(modelResult!.path);
    expect(modelResult!.reason).toBe(expectedReason);
    expect(modelResult!.path).toBe(expectedPath);
  });
});

describe('serializeFlightDocument', () => {
  it('round-trips a minimal Scene2D through model and text', () => {
    const scene = createScene2D();
    const schemas = createTestSchemas();
    const document = createTestDocument(createFlightDocumentFromScene2D(scene, schemas));
    const text = serializeFlightDocument(document);
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
    const text = serializeFlightDocument(document);
    const reparsed = createFlightDocumentScene2DMaterializationFromText(text, schemas);
    expect(reparsed).not.toBeNull();
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
