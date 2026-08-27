import type { Kind } from './Entity';

// Stable identities shared by text parsing, logical validation, resource resolution, and scene
// materialization. Limit values are intentionally not caller-configurable; the six limit identities
// below name the fixed parser bounds without making those numeric bounds public configuration.
export const FlightDocumentRefusalReason = {
  AliasUnsupported: 'flight-document.unsupported.alias',
  AnchorUnsupported: 'flight-document.unsupported.anchor',
  BlockScalarUnsupported: 'flight-document.unsupported.block-scalar',
  CollectionEntriesLimitExceeded: 'flight-document.limit.collection-entries',
  DocumentCodeUnitsLimitExceeded: 'flight-document.limit.document-code-units',
  DocumentSeparatorUnsupported: 'flight-document.unsupported.document-separator',
  DuplicateAmbientLight: 'flight-document.structure.duplicate-ambient-light',
  DuplicateDirectionalLight: 'flight-document.structure.duplicate-directional-light',
  DuplicateKey: 'flight-document.syntax.duplicate-key',
  FieldInvalid: 'flight-document.field.invalid',
  FlowSequenceUnsupported: 'flight-document.unsupported.flow-sequence',
  KeyCodeUnitsLimitExceeded: 'flight-document.limit.key-code-units',
  NestingDepthLimitExceeded: 'flight-document.limit.nesting-depth',
  NodeKindUnregistered: 'flight-document.node-kind.unregistered',
  ResourceKindUnregistered: 'flight-document.resource-kind.unregistered',
  ResourceResolverUnregistered: 'flight-document.resource-resolver.unregistered',
  ResourceUnresolved: 'flight-document.resource.unresolved',
  RootKindMismatch: 'flight-document.structure.root-kind-mismatch',
  ScalarCodeUnitsLimitExceeded: 'flight-document.limit.scalar-code-units',
  ScalarInvalid: 'flight-document.scalar.invalid',
  ShapeCommandUnregistered: 'flight-document.shape-command.unregistered',
  StructureInvalid: 'flight-document.structure.invalid',
  TagUnsupported: 'flight-document.unsupported.tag',
  TotalNodesLimitExceeded: 'flight-document.limit.total-nodes',
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
