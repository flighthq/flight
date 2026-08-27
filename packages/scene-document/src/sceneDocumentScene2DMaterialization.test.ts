import { addNodeChild } from '@flighthq/node/contract';
import { createDisplayObject, createScene2D, createSprite } from '@flighthq/scene2d/contract';
import { DisplayObjectKind, SpriteKind } from '@flighthq/types/contract';
import type { FlightDocument, FlightDocumentScene2DMaterialization } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createFlightDocumentFromScene2D,
  createFlightDocumentScene2DMaterialization,
  createFlightDocumentScene2DMaterializationFromText,
  explainFlightDocumentRefusal,
  serializeFlightDocument,
} from './sceneDocumentScene2DMaterialization';

describe('createFlightDocumentFromScene2D', () => {
  it('creates a model from a Scene2D', () => {
    const scene = createScene2D();
    const document = createFlightDocumentFromScene2D(scene);
    expect(document.metadata.kind).toBe('Scene2D');
    expect(document.metadata.version).toBe(1);
    expect(document.lights).toHaveLength(0);
  });

  it('elides default-valued properties', () => {
    const scene = createScene2D();
    const obj = createDisplayObject({ name: 'default' });
    addNodeChild(scene.root, obj);
    const document = createFlightDocumentFromScene2D(scene);
    expect(document.tree[0].properties.x).toBeUndefined();
    expect(document.tree[0].properties.y).toBeUndefined();
    expect(document.tree[0].properties.scaleX).toBeUndefined();
    expect(document.tree[0].properties.rotation).toBeUndefined();
    expect(document.tree[0].properties.alpha).toBeUndefined();
  });

  it('preserves transform properties', () => {
    const scene = createScene2D();
    const obj = createDisplayObject({ name: 'moved' });
    obj.x = 100;
    obj.y = 200;
    obj.scaleX = 2;
    obj.scaleY = 3;
    obj.rotation = 45;
    obj.alpha = 0.5;
    addNodeChild(scene.root, obj);
    const document = createFlightDocumentFromScene2D(scene);
    expect(document.tree[0].properties.x).toBe(100);
    expect(document.tree[0].properties.y).toBe(200);
    expect(document.tree[0].properties.scaleX).toBe(2);
    expect(document.tree[0].properties.scaleY).toBe(3);
    expect(document.tree[0].properties.rotation).toBe(45);
    expect(document.tree[0].properties.alpha).toBe(0.5);
  });

  it('serializes children into nested tree nodes', () => {
    const scene = createScene2D();
    const sprite = createSprite({ name: 'hero' });
    addNodeChild(scene.root, sprite);
    const document = createFlightDocumentFromScene2D(scene);
    expect(document.tree).toHaveLength(1);
    expect(document.tree[0].kind).toBe(SpriteKind);
    expect(document.tree[0].name).toBe('hero');
  });
});

describe('createFlightDocumentScene2DMaterialization', () => {
  it('materializes an empty Scene2D from a minimal model', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene2D', version: 1 },
      resources: [],
      tree: [],
    };
    const result = createFlightDocumentScene2DMaterialization(document, createTestResolver());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    expect(materialization.scene).toBeDefined();
    expect(materialization.scene.root).toBeDefined();
  });

  it('materializes a tree with nested children', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene2D', version: 1 },
      resources: [],
      tree: [
        {
          children: [
            {
              children: [],
              kind: SpriteKind,
              name: 'hero',
              properties: {},
            },
          ],
          kind: DisplayObjectKind,
          name: 'group',
          properties: {},
        },
      ],
    };
    const result = createFlightDocumentScene2DMaterialization(document, createTestResolver());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    expect(materialization.scene.root).toBeDefined();
  });

  it('returns null for a Scene3D document', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene3D', version: 1 },
      resources: [],
      tree: [],
    };
    const result = createFlightDocumentScene2DMaterialization(document, createTestResolver());
    expect(result).toBeNull();
  });

  it('returns null for an unsupported version', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene2D', version: 99 },
      resources: [],
      tree: [],
    };
    const result = createFlightDocumentScene2DMaterialization(document, createTestResolver());
    expect(result).toBeNull();
  });
});

describe('createFlightDocumentScene2DMaterializationFromText', () => {
  it('materializes a Scene2D from YAML text', () => {
    const yaml = ['flight: 1', 'kind: Scene2D', 'scene:', '  children:', '    - kind: Sprite', '      name: bg'].join(
      '\n',
    );
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, createTestResolver());
    expect(result).not.toBeNull();
    const materialization = result as FlightDocumentScene2DMaterialization;
    expect(materialization.scene).toBeDefined();
  });

  it('returns null for a Scene3D YAML document', () => {
    const yaml = ['flight: 1', 'kind: Scene3D', 'scene:', '  children: []'].join('\n');
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, createTestResolver());
    expect(result).toBeNull();
  });

  it('returns null for unsupported YAML constructs', () => {
    const yaml = 'flight: 1\nkind: Scene2D\nanchor: &ref value\n';
    const result = createFlightDocumentScene2DMaterializationFromText(yaml, createTestResolver());
    expect(result).toBeNull();
  });
});

describe('explainFlightDocumentRefusal', () => {
  it('explains a dimension mismatch', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene3D', version: 1 },
      resources: [],
      tree: [],
    };
    const result = createFlightDocumentScene2DMaterialization(document, createTestResolver());
    expect(result).toBeNull();
    const explanation = explainFlightDocumentRefusal(document, 'Scene2D');
    expect(explanation).not.toBeNull();
    expect(explanation!.kind).toBe('DimensionMismatch');
  });

  it('explains an unsupported version', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene2D', version: 99 },
      resources: [],
      tree: [],
    };
    const result = createFlightDocumentScene2DMaterialization(document, createTestResolver());
    expect(result).toBeNull();
    const explanation = explainFlightDocumentRefusal(document, 'Scene2D');
    expect(explanation).not.toBeNull();
    expect(explanation!.kind).toBe('UnsupportedVersion');
  });

  it('returns null when the document is valid', () => {
    const document: FlightDocument = {
      lights: [],
      metadata: { kind: 'Scene2D', version: 1 },
      resources: [],
      tree: [],
    };
    const explanation = explainFlightDocumentRefusal(document, 'Scene2D');
    expect(explanation).toBeNull();
  });
});

describe('serializeFlightDocument', () => {
  it('round-trips a minimal Scene2D through model and text', () => {
    const scene = createScene2D();
    const document = createFlightDocumentFromScene2D(scene);
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
    const document = createFlightDocumentFromScene2D(scene);
    const text = serializeFlightDocument(document);
    const reparsed = createFlightDocumentScene2DMaterializationFromText(text, createTestResolver());
    expect(reparsed).not.toBeNull();
  });
});

function createTestResolver(): never {
  return undefined as never;
}
