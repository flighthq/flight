import { getNodeChildren } from '@flighthq/node/contract';
import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import { createFlightDocumentScene2DMaterialization, parseFlightDocumentText } from '@flighthq/scene-document/contract';
import { createDisplayObject, createSprite } from '@flighthq/scene2d/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNodeSchema,
  FlightDocumentScene2D,
  FlightDocumentSchemaRegistry,
  Node2D,
  NodeAny,
} from '@flighthq/types/contract';
import { DisplayObjectKind, SpriteKind } from '@flighthq/types/contract';

import {
  createFlightDocumentTokenResolverRegistry,
  resolveFlightDocumentSceneTokens,
} from './flightDocumentSceneTokens';
import { substituteFlightDocumentSceneTokens } from './substituteFlightDocumentSceneTokens';

// The one flow no single package can cover: authored text, through resolution and substitution, into
// a materialized scene. It is the serialization round-trip carve-out in the testing conventions, not a
// generic integration bucket — each stage's own behavior is unit-tested where it lives.
describe('flightDocumentSceneTokenPipeline', () => {
  it('carries an authored reference through to the materialized node for the requested mode', () => {
    const document = parseAuthoredDocument();
    const substituted = substituteScene(document, 'dark');
    const materialization = createFlightDocumentScene2DMaterialization(
      { ...document, scenes: [substituted] },
      createTestSchemas(),
    );
    const child = getNodeChildren(materialization?.scene.root as NodeAny)[0] as Node2D;
    // 0.25 and 40 are the dark variants written in the fixture text below, restated here rather than
    // read back out of the document: sourcing them from the parsed tokens would pass for any mapping.
    expect(child.alpha).toBe(0.25);
    expect(child.x).toBe(40);
  });

  it('produces the other mode values from the same authored document', () => {
    const document = parseAuthoredDocument();
    const substituted = substituteScene(document, 'light');
    const materialization = createFlightDocumentScene2DMaterialization(
      { ...document, scenes: [substituted] },
      createTestSchemas(),
    );
    const child = getNodeChildren(materialization?.scene.root as NodeAny)[0] as Node2D;
    expect(child.alpha).toBe(1);
    expect(child.x).toBe(40);
  });

  it('refuses the whole flow when a referenced token is not declared', () => {
    const document = parseFlightDocumentText(
      'flight: 1\ndefaultScene: 0\nscenes:\n' +
        '  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n      children:\n' +
        '        - kind: Sprite\n          alpha: "$opacity.absent"\n',
    );
    if (document === null) throw new Error('expected the fixture to parse');
    const scene = document.scenes[0];
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    if (resolution === null) throw new Error('expected an empty token table to resolve');
    expect(substituteFlightDocumentSceneTokens(scene, resolution)).toBeNull();
  });
});

function parseAuthoredDocument(): FlightDocument {
  const document = parseFlightDocumentText(
    'flight: 1\ndefaultScene: 0\nscenes:\n' +
      '  - kind: Scene2D\n' +
      '    scene:\n      kind: DisplayObject\n      children:\n' +
      '        - kind: Sprite\n          alpha: "$opacity.panel"\n          x: "$space.inset"\n' +
      '    tokens:\n' +
      '      - kind: Number\n        key: opacity.panel\n        dark: 0.25\n        light: 1\n' +
      '      - kind: Number\n        key: space.inset\n        default: 40\n',
  );
  if (document === null) throw new Error('expected the authored token fixture to parse');
  return document;
}

function substituteScene(document: Readonly<FlightDocument>, mode: string): FlightDocumentScene2D {
  const scene = document.scenes[0];
  if (scene.kind !== 'Scene2D') throw new Error('expected a 2D fixture entry');
  const resolution = resolveFlightDocumentSceneTokens(scene, mode, createFlightDocumentTokenResolverRegistry());
  if (resolution === null) throw new Error('expected the fixture token table to resolve');
  const substituted = substituteFlightDocumentSceneTokens(scene, resolution);
  if (substituted === null) throw new Error('expected every authored reference to substitute');
  return substituted;
}

function createTestSchemas(): FlightDocumentSchemaRegistry {
  const displayObjectSchema: FlightDocumentNodeSchema = {
    createNode: (fields: Readonly<FlightDocumentFields>) => applyFields(createDisplayObject(), fields),
    fields: [],
    kind: DisplayObjectKind,
    writeNodeFields: () => true,
  };
  const spriteSchema: FlightDocumentNodeSchema = {
    createNode: (fields: Readonly<FlightDocumentFields>) => applyFields(createSprite(), fields),
    fields: [
      { defaultValue: 1, name: 'alpha', required: false, validate: (value) => typeof value === 'number' },
      { defaultValue: 0, name: 'x', required: false, validate: (value) => typeof value === 'number' },
    ],
    kind: SpriteKind,
    writeNodeFields: () => true,
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

// Deliberately assigns only when the field is already a number: a reference that failed to substitute
// arrives as a string, and this fixture must leave the default in place rather than coerce it, so a
// broken substitution shows up as a failed assertion instead of NaN.
function applyFields(target: Node2D, fields: Readonly<FlightDocumentFields>): Node2D {
  if (typeof fields['alpha'] === 'number') target.alpha = fields['alpha'];
  if (typeof fields['x'] === 'number') target.x = fields['x'];
  return target;
}
