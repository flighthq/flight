import { FlightDocumentRefusalReason } from './FlightDocumentRefusalExplanation';

describe('FlightDocumentRefusalReason', () => {
  it('exposes every YAML syntax and scalar refusal identity', () => {
    expect([
      FlightDocumentRefusalReason.ExpectedFlowDelimiter,
      FlightDocumentRefusalReason.ExpectedMappingEntry,
      FlightDocumentRefusalReason.ExpectedMappingKey,
      FlightDocumentRefusalReason.ExpectedScalar,
      FlightDocumentRefusalReason.ExpectedValue,
      FlightDocumentRefusalReason.DuplicateKey,
      FlightDocumentRefusalReason.InvalidDocument,
      FlightDocumentRefusalReason.InvalidEscape,
      FlightDocumentRefusalReason.MixedCollection,
      FlightDocumentRefusalReason.MultipleRootValues,
      FlightDocumentRefusalReason.NumberOutOfRange,
      FlightDocumentRefusalReason.RootIndentation,
      FlightDocumentRefusalReason.TabCharacter,
      FlightDocumentRefusalReason.TrailingFlowComma,
      FlightDocumentRefusalReason.TrailingFlowContent,
      FlightDocumentRefusalReason.UnexpectedIndentation,
      FlightDocumentRefusalReason.UnexpectedToken,
      FlightDocumentRefusalReason.UnterminatedFlowMapping,
      FlightDocumentRefusalReason.UnterminatedQuotedScalar,
    ]).toEqual([
      'flight-document.syntax.expected-flow-delimiter',
      'flight-document.syntax.expected-mapping-entry',
      'flight-document.syntax.expected-mapping-key',
      'flight-document.syntax.expected-scalar',
      'flight-document.syntax.expected-value',
      'flight-document.syntax.duplicate-key',
      'flight-document.syntax.invalid-document',
      'flight-document.syntax.invalid-escape',
      'flight-document.syntax.mixed-collection',
      'flight-document.syntax.multiple-root-values',
      'flight-document.scalar.number-out-of-range',
      'flight-document.syntax.root-indentation',
      'flight-document.syntax.tab-character',
      'flight-document.syntax.trailing-flow-comma',
      'flight-document.syntax.trailing-flow-content',
      'flight-document.syntax.unexpected-indentation',
      'flight-document.syntax.unexpected-token',
      'flight-document.syntax.unterminated-flow-mapping',
      'flight-document.syntax.unterminated-quoted-scalar',
    ]);
  });

  it('keeps alias and anchor refusals distinct', () => {
    expect(FlightDocumentRefusalReason.AliasUnsupported).toBe('flight-document.unsupported.alias');
    expect(FlightDocumentRefusalReason.AnchorUnsupported).toBe('flight-document.unsupported.anchor');
    expect(FlightDocumentRefusalReason.AliasUnsupported).not.toBe(FlightDocumentRefusalReason.AnchorUnsupported);
  });

  it('publishes every YAML-subset exclusion identity', () => {
    expect([
      FlightDocumentRefusalReason.AliasUnsupported,
      FlightDocumentRefusalReason.AnchorUnsupported,
      FlightDocumentRefusalReason.BlockScalarUnsupported,
      FlightDocumentRefusalReason.DocumentSeparatorUnsupported,
      FlightDocumentRefusalReason.FlowSequenceUnsupported,
      FlightDocumentRefusalReason.TagUnsupported,
    ]).toEqual([
      'flight-document.unsupported.alias',
      'flight-document.unsupported.anchor',
      'flight-document.unsupported.block-scalar',
      'flight-document.unsupported.document-separator',
      'flight-document.unsupported.flow-sequence',
      'flight-document.unsupported.tag',
    ]);
  });

  it('names empty scenes and an out-of-range default scene independently', () => {
    expect(FlightDocumentRefusalReason.ScenesEmpty).toBe('flight-document.structure.scenes-empty');
    expect(FlightDocumentRefusalReason.DefaultSceneOutOfRange).toBe(
      'flight-document.structure.default-scene-out-of-range',
    );
    expect(FlightDocumentRefusalReason.ScenesEmpty).not.toBe(FlightDocumentRefusalReason.DefaultSceneOutOfRange);
  });

  it('pins the six fixed parser limit identities', () => {
    expect([
      FlightDocumentRefusalReason.CollectionEntriesLimitExceeded,
      FlightDocumentRefusalReason.DocumentCodeUnitsLimitExceeded,
      FlightDocumentRefusalReason.KeyCodeUnitsLimitExceeded,
      FlightDocumentRefusalReason.NestingDepthLimitExceeded,
      FlightDocumentRefusalReason.ScalarCodeUnitsLimitExceeded,
      FlightDocumentRefusalReason.TotalNodesLimitExceeded,
    ]).toEqual([
      'flight-document.limit.collection-entries',
      'flight-document.limit.document-code-units',
      'flight-document.limit.key-code-units',
      'flight-document.limit.nesting-depth',
      'flight-document.limit.scalar-code-units',
      'flight-document.limit.total-nodes',
    ]);
  });

  it('names root-dimension and singleton-light refusals independently', () => {
    expect(FlightDocumentRefusalReason.RootKindMismatch).toBe('flight-document.structure.root-kind-mismatch');
    expect(FlightDocumentRefusalReason.DuplicateAmbientLight).toBe('flight-document.structure.duplicate-ambient-light');
    expect(FlightDocumentRefusalReason.DuplicateDirectionalLight).toBe(
      'flight-document.structure.duplicate-directional-light',
    );
  });
});
