import type {
  FlightDocumentNode,
  FlightDocumentScene,
  FlightDocumentScene2D,
  FlightDocumentScene3D,
  FlightDocumentToken,
  FlightDocumentTokenResolution,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import {
  createFlightDocumentTokenResolverRegistry,
  resolveFlightDocumentSceneTokens,
} from './flightDocumentSceneTokens';
import {
  explainFlightDocumentSceneTokenSubstitution,
  substituteFlightDocumentSceneTokens,
} from './substituteFlightDocumentSceneTokens';

describe('explainFlightDocumentSceneTokenSubstitution', () => {
  it('names a reference no resolved token covers, with the field that carries it', () => {
    const scene = sceneWith({ children: [], fields: { fill: '$color.absent' }, kind: 'Shape' }, [
      { key: 'color.background', kind: 'Color', values: { default: 0xffffffff } },
    ]);
    const explanation = explainFlightDocumentSceneTokenSubstitution(scene, resolutionOf(scene));
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenUnresolved);
    expect(explanation?.tokenKey).toBe('color.absent');
    expect(explanation?.path).toBe('scene.fields.fill');
  });

  it('names a malformed reference rather than passing the raw string through', () => {
    const scene = sceneWith({ children: [], fields: { fill: '$9lives' }, kind: 'Shape' }, []);
    const explanation = explainFlightDocumentSceneTokenSubstitution(scene, resolutionOf(scene));
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenReferenceInvalid);
    expect(explanation?.path).toBe('scene.fields.fill');
  });

  it('qualifies the path of a reference nested in a descendant command list', () => {
    const scene = sceneWith(
      {
        children: [
          { children: [], fields: {}, kind: 'Sprite' },
          { children: [], fields: { commands: [{ beginFill: { color: '$color.absent' } }] }, kind: 'Shape' },
        ],
        fields: {},
        kind: 'DisplayObject',
      },
      [],
    );
    const explanation = explainFlightDocumentSceneTokenSubstitution(scene, resolutionOf(scene));
    expect(explanation?.path).toBe('scene.children[1].fields.commands[0].beginFill.color');
  });

  it('reports nothing when every reference resolves', () => {
    const scene = sceneWith({ children: [], fields: { fill: '$color.background' }, kind: 'Shape' }, [
      { key: 'color.background', kind: 'Color', values: { default: 0xffffffff } },
    ]);
    expect(explainFlightDocumentSceneTokenSubstitution(scene, resolutionOf(scene))).toBeNull();
  });
});

describe('substituteFlightDocumentSceneTokens', () => {
  it('replaces a reference nested inside a command argument map inside an array', () => {
    const scene = sceneWith(
      {
        children: [
          {
            children: [],
            fields: {
              commands: [
                { beginFill: { alpha: 1, color: '$color.background' } },
                { drawRectangle: { height: '$space.gutter', width: 120 } },
              ],
            },
            kind: 'Shape',
          },
        ],
        fields: {},
        kind: 'DisplayObject',
      },
      [
        { key: 'color.background', kind: 'Color', values: { dark: 0x1a1a1aff, light: 0xffffffff } },
        { key: 'space.gutter', kind: 'Number', values: { default: 8 } },
      ],
    );
    const substituted = substituteFlightDocumentSceneTokens(scene, resolutionOf(scene, 'dark'));
    // The expected values are literals, not reads back out of the token rows the substitution used: a
    // test that sourced them from scene.tokens would pass for any mapping, including the wrong one.
    expect(substituted?.scene.children[0].fields['commands']).toEqual([
      { beginFill: { alpha: 1, color: 0x1a1a1aff } },
      { drawRectangle: { height: 8, width: 120 } },
    ]);
  });

  it('leaves a scene without references structurally equal to its input', () => {
    const scene = sceneWith({ children: [], fields: { x: 12 }, kind: 'Sprite' }, []);
    expect(substituteFlightDocumentSceneTokens(scene, resolutionOf(scene))).toEqual(scene);
  });

  it('never mutates the scene it was given', () => {
    const scene = sceneWith({ children: [], fields: { fill: '$color.background' }, kind: 'Shape' }, [
      { key: 'color.background', kind: 'Color', values: { default: 0xffffffff } },
    ]);
    substituteFlightDocumentSceneTokens(scene, resolutionOf(scene));
    expect(scene.scene.fields['fill']).toBe('$color.background');
  });

  it('keeps the token section so the palette still round-trips', () => {
    const scene = sceneWith({ children: [], fields: { fill: '$color.background' }, kind: 'Shape' }, [
      { key: 'color.background', kind: 'Color', values: { default: 0xffffffff } },
    ]);
    expect(substituteFlightDocumentSceneTokens(scene, resolutionOf(scene))?.tokens).toEqual(scene.tokens);
  });

  it('resolves an escaped dollar sign to a literal instead of looking it up', () => {
    const scene = sceneWith({ children: [], fields: { text: '$$5.00' }, kind: 'TextLabel' }, []);
    expect(substituteFlightDocumentSceneTokens(scene, resolutionOf(scene))?.scene.fields['text']).toBe('$5.00');
  });

  it('preserves the 3D dimension and its camera and light sections', () => {
    const scene: FlightDocumentScene3D = {
      cameras: [],
      kind: 'Scene3D',
      lights: [],
      scene: { children: [], fields: { alpha: '$opacity.dim' }, kind: 'Node3D' },
      tokens: [{ key: 'opacity.dim', kind: 'Number', values: { default: 0.5 } }],
    };
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    if (resolution === null) throw new Error('expected the 3D token fixture to resolve');
    const substituted = substituteFlightDocumentSceneTokens(scene, resolution);
    expect(substituted?.kind).toBe('Scene3D');
    expect(substituted?.cameras).toEqual([]);
    expect(substituted?.scene.fields['alpha']).toBe(0.5);
  });

  it('accepts the scene union a caller reads out of document.scenes without narrowing it first', () => {
    const entries: FlightDocumentScene[] = [
      sceneWith({ children: [], fields: { fill: '$color.background' }, kind: 'Shape' }, [
        { key: 'color.background', kind: 'Color', values: { default: 0xffffffff } },
      ]),
    ];
    const substituted = substituteFlightDocumentSceneTokens(entries[0], resolutionOf(entries[0]));
    expect(substituted?.kind).toBe('Scene2D');
  });

  it('returns null wherever the explain seam reports a refusal', () => {
    const scene = sceneWith({ children: [], fields: { fill: '$color.absent' }, kind: 'Shape' }, []);
    expect(substituteFlightDocumentSceneTokens(scene, resolutionOf(scene))).toBeNull();
  });
});

function resolutionOf(
  scene: Readonly<FlightDocumentScene2D | FlightDocumentScene3D>,
  mode = 'default',
): FlightDocumentTokenResolution {
  const resolution = resolveFlightDocumentSceneTokens(scene, mode, createFlightDocumentTokenResolverRegistry());
  if (resolution === null) throw new Error('expected the fixture token table to resolve');
  return resolution;
}

function sceneWith(scene: FlightDocumentNode, tokens: readonly FlightDocumentToken[]): FlightDocumentScene2D {
  return { backgroundColor: null, kind: 'Scene2D', scene, tokens: [...tokens] };
}
