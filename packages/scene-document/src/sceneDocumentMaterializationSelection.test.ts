import type { FlightDocument } from '@flighthq/types/contract';
import { DisplayObjectKind, FlightDocumentRefusalReason, Node3DKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { selectFlightDocumentScene } from './sceneDocumentMaterializationSelection';

describe('selectFlightDocumentScene', () => {
  it('selects the default or requested scene when its dimension matches', () => {
    const document = createDocument();

    expect(selectFlightDocumentScene(document, 'Scene3D')).toMatchObject({
      refusal: null,
      scene: document.scenes[1],
      sceneIndex: 1,
    });
    expect(selectFlightDocumentScene(document, 'Scene2D', 0)).toMatchObject({
      refusal: null,
      scene: document.scenes[0],
      sceneIndex: 0,
    });
  });

  it('refuses invalid containers and mismatched dimensions', () => {
    const emptyDocument = { ...createDocument(), scenes: [] } as unknown as FlightDocument;

    expect(selectFlightDocumentScene(emptyDocument, 'Scene2D')).toMatchObject({
      refusal: { path: 'scenes', reason: FlightDocumentRefusalReason.ScenesEmpty },
      scene: null,
    });
    expect(selectFlightDocumentScene(createDocument(), 'Scene2D')).toMatchObject({
      refusal: { path: 'scenes[1].kind', reason: FlightDocumentRefusalReason.StructureInvalid },
      scene: null,
    });
  });
});

function createDocument(): FlightDocument {
  return {
    defaultScene: 1,
    resources: [],
    scenes: [
      {
        backgroundColor: null,
        kind: 'Scene2D',
        scene: { children: [], fields: {}, kind: DisplayObjectKind },
      },
      {
        cameras: [],
        kind: 'Scene3D',
        lights: [],
        scene: { children: [], fields: {}, kind: Node3DKind },
      },
    ],
    version: 1,
  };
}
