import type { FlightDocument, FlightDocumentRefusalExplanation, FlightDocumentScene } from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { createDocumentRefusal, createSceneRefusal } from './sceneDocumentRefusal';

type FlightDocumentSceneSelection =
  | {
      readonly refusal: FlightDocumentRefusalExplanation;
      readonly scene: null;
      readonly sceneIndex: null;
    }
  | {
      readonly refusal: null;
      readonly scene: Readonly<FlightDocumentScene>;
      readonly sceneIndex: number;
    };

// The logical type makes scenes non-empty, but parsed/untrusted values reach this boundary before they
// can honestly claim that type. Validate the runtime container once here so both dimension entrypoints
// agree on empty/default selection and on scene-qualified paths.
export function selectFlightDocumentScene(
  document: Readonly<FlightDocument>,
  dimension: 'Scene2D' | 'Scene3D',
  requestedSceneIndex: number = document.defaultScene,
): FlightDocumentSceneSelection {
  if (document.version !== 1) {
    return {
      refusal: {
        ...createDocumentRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version'),
        version: document.version,
      },
      scene: null,
      sceneIndex: null,
    };
  }
  const scenes = document.scenes as readonly Readonly<FlightDocumentScene>[];
  if (scenes.length === 0) {
    return {
      refusal: createDocumentRefusal(FlightDocumentRefusalReason.ScenesEmpty, 'scenes'),
      scene: null,
      sceneIndex: null,
    };
  }
  if (!isSceneIndex(document.defaultScene, scenes.length)) {
    return {
      refusal: {
        ...createDocumentRefusal(FlightDocumentRefusalReason.DefaultSceneOutOfRange, 'defaultScene'),
        actual: document.defaultScene,
      },
      scene: null,
      sceneIndex: null,
    };
  }
  if (!isSceneIndex(requestedSceneIndex, scenes.length)) {
    return {
      refusal: createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, requestedSceneIndex, ''),
      scene: null,
      sceneIndex: null,
    };
  }
  const scene = scenes[requestedSceneIndex];
  if (scene.kind !== dimension) {
    return {
      refusal: createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, requestedSceneIndex, 'kind'),
      scene: null,
      sceneIndex: null,
    };
  }
  return { refusal: null, scene, sceneIndex: requestedSceneIndex };
}

function isSceneIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}
