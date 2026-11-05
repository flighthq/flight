// Compatibility wrapper: Scene2D Formats owns the Rive document contracts.
export type {
  RiveAdvancedBlend,
  RiveAnimationClip,
  RiveArtboardGraph,
  RiveArtboardImport,
  RiveCoreObject,
  RiveDocument,
  RiveDocumentHeader,
  RiveDocumentImportResult,
  RiveFileAsset,
  RiveLayoutImport,
  RiveObjectGraph,
  RivePathRecord,
  RiveProperty,
  RivePropertyFieldType,
  RiveScene2DDocumentResult,
  RiveSkeleton2DImport,
  RiveStateMachineDescriptor,
  RiveStateMachineInput,
  RiveStateMachineLayer,
  RiveStateMachineState,
  RiveStateMachineTransition,
  RiveValue,
  RiveWeightedPoint,
} from '@flighthq/scene2d-formats/contract';

/** @deprecated Import Rive contracts from `@flighthq/scene2d-formats/contract`. These runtime
 * values stay duplicated because @flighthq/types may re-export owner contracts only as types. */
export const RiveFieldType = {
  Uint: 0,
  String: 1,
  Double: 2,
  Color: 3,
} as const;

export type RiveFieldType = (typeof RiveFieldType)[keyof typeof RiveFieldType];

export const RiveAnimationLoop = {
  OneShot: 'OneShot',
  Loop: 'Loop',
  PingPong: 'PingPong',
} as const;

export type RiveAnimationLoop = (typeof RiveAnimationLoop)[keyof typeof RiveAnimationLoop];

export const RiveWeightedPointKind = {
  Point: 'Point',
  In: 'In',
  Out: 'Out',
} as const;

export type RiveWeightedPointKind = (typeof RiveWeightedPointKind)[keyof typeof RiveWeightedPointKind];
