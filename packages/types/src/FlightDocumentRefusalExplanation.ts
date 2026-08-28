import type { Kind } from './Entity';

// Stable identities shared by text parsing, logical validation, resource resolution, and scene
// materialization. Limit values are intentionally not caller-configurable; the six limit identities
// below name the fixed parser bounds without making those numeric bounds public configuration.
export const FlightDocumentRefusalReason = {
  AliasUnsupported: 'flight-document.unsupported.alias',
  AnchorUnsupported: 'flight-document.unsupported.anchor',
  BlockScalarUnsupported: 'flight-document.unsupported.block-scalar',
  CollectionEntriesLimitExceeded: 'flight-document.limit.collection-entries',
  DefaultSceneOutOfRange: 'flight-document.structure.default-scene-out-of-range',
  DocumentCodeUnitsLimitExceeded: 'flight-document.limit.document-code-units',
  DocumentSeparatorUnsupported: 'flight-document.unsupported.document-separator',
  DuplicateAmbientLight: 'flight-document.structure.duplicate-ambient-light',
  DuplicateDirectionalLight: 'flight-document.structure.duplicate-directional-light',
  DuplicateKey: 'flight-document.syntax.duplicate-key',
  ExpectedFlowDelimiter: 'flight-document.syntax.expected-flow-delimiter',
  ExpectedMappingEntry: 'flight-document.syntax.expected-mapping-entry',
  ExpectedMappingKey: 'flight-document.syntax.expected-mapping-key',
  ExpectedScalar: 'flight-document.syntax.expected-scalar',
  ExpectedValue: 'flight-document.syntax.expected-value',
  FieldInvalid: 'flight-document.field.invalid',
  FlowSequenceUnsupported: 'flight-document.unsupported.flow-sequence',
  InvalidDocument: 'flight-document.syntax.invalid-document',
  InvalidEscape: 'flight-document.syntax.invalid-escape',
  KeyCodeUnitsLimitExceeded: 'flight-document.limit.key-code-units',
  MixedCollection: 'flight-document.syntax.mixed-collection',
  MultipleRootValues: 'flight-document.syntax.multiple-root-values',
  NestingDepthLimitExceeded: 'flight-document.limit.nesting-depth',
  NodeKindUnregistered: 'flight-document.node-kind.unregistered',
  NumberOutOfRange: 'flight-document.scalar.number-out-of-range',
  ResourceKindUnregistered: 'flight-document.resource-kind.unregistered',
  ResourceResolverUnregistered: 'flight-document.resource-resolver.unregistered',
  ResourceUnresolved: 'flight-document.resource.unresolved',
  RootIndentation: 'flight-document.syntax.root-indentation',
  RootKindMismatch: 'flight-document.structure.root-kind-mismatch',
  ScalarCodeUnitsLimitExceeded: 'flight-document.limit.scalar-code-units',
  ScalarInvalid: 'flight-document.scalar.invalid',
  ShapeCommandUnregistered: 'flight-document.shape-command.unregistered',
  ScenesEmpty: 'flight-document.structure.scenes-empty',
  StructureInvalid: 'flight-document.structure.invalid',
  TabCharacter: 'flight-document.syntax.tab-character',
  TagUnsupported: 'flight-document.unsupported.tag',
  TotalNodesLimitExceeded: 'flight-document.limit.total-nodes',
  TrailingFlowComma: 'flight-document.syntax.trailing-flow-comma',
  TrailingFlowContent: 'flight-document.syntax.trailing-flow-content',
  UnexpectedIndentation: 'flight-document.syntax.unexpected-indentation',
  UnexpectedToken: 'flight-document.syntax.unexpected-token',
  UnterminatedFlowMapping: 'flight-document.syntax.unterminated-flow-mapping',
  UnterminatedQuotedScalar: 'flight-document.syntax.unterminated-quoted-scalar',
  VersionUnsupported: 'flight-document.version.unsupported',
} as const;

export type FlightDocumentRefusalReason =
  (typeof FlightDocumentRefusalReason)[keyof typeof FlightDocumentRefusalReason];

// One diagnostic shape spans every null-returning document seam. A field is null when that refusal
// has no corresponding context; path is empty when the failure cannot be localized structurally.
export interface FlightDocumentRefusalExplanation {
  actual: number | null;
  column: number | null;
  kind: Kind | null;
  limit: number | null;
  line: number | null;
  offset: number | null;
  path: string;
  reason: FlightDocumentRefusalReason;
  resourceKey: string | null;
  version: number | null;
}
