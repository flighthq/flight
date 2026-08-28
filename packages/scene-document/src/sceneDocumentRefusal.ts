import type {
  FlightDocumentRefusalExplanation,
  FlightDocumentRefusalReason as FlightDocumentRefusalReasonType,
} from '@flighthq/types/contract';

export function createDocumentRefusal(
  reason: FlightDocumentRefusalReasonType,
  path: string,
): FlightDocumentRefusalExplanation {
  return {
    actual: null,
    column: null,
    kind: null,
    limit: null,
    line: null,
    offset: null,
    path,
    reason,
    resourceKey: null,
    version: null,
  };
}

export function createSceneRefusal(
  reason: FlightDocumentRefusalReasonType,
  sceneIndex: number,
  innerPath: string,
): FlightDocumentRefusalExplanation {
  const path = innerPath === '' ? `scenes[${sceneIndex}]` : `scenes[${sceneIndex}].${innerPath}`;
  return createDocumentRefusal(reason, path);
}
